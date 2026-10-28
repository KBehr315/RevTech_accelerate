-- Platform: background jobs
--
-- A small Postgres-backed queue for the worker (worker/). Jobs are rows in
-- public.jobs, so their status is readable through the same RLS as everything
-- else, and a job commits in the same transaction as the request that created it.
--
-- Who does what:
--   * People never insert jobs directly. A permission-checked command (for now
--     only request_health_check) calls enqueue_job().
--   * The worker logs in as accelerate_worker, a member of the `worker` role
--     (created by server/migrate.js from a secret, like the PostgREST login).
--     It may only claim, finish and fail jobs. When a job acts for the person
--     who requested it, the worker switches to `authenticated` with that
--     person's id, so RLS limits the job to what they could do themselves.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'worker') then
    create role worker nologin;
  end if;
end
$$;

grant usage on schema public, auth to worker;

create table public.jobs (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null,
  client_id     uuid references public.clients(id) on delete cascade,
  requested_by  uuid references public.profiles(id),
  payload       jsonb not null default '{}',
  status        text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed', 'canceled')),
  attempts      int not null default 0,
  max_attempts  int not null default 3 check (max_attempts > 0),
  run_after     timestamptz not null default now(),
  locked_by     text,
  locked_at     timestamptz,
  last_error    text,
  result        jsonb,
  finished_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index jobs_ready_idx on public.jobs(run_after) where status = 'queued';
create index jobs_client_idx on public.jobs(client_id, created_at desc);

create trigger set_updated_at before update on public.jobs
for each row execute function public.handle_updated_at();

alter table public.jobs enable row level security;

-- Your own jobs; a client's jobs for its Client Training Administrators;
-- platform-level jobs for Platform Administrators.
create policy jobs_select on public.jobs for select
  using (
    requested_by = auth.uid()
    or (client_id is not null and public.has_client_role(client_id, 'client_training_admin'))
    or (client_id is null and public.is_platform_admin())
  );
revoke insert, update, delete on public.jobs from authenticated;

-- Internal: called by permission-checked commands, never granted to callers.
create or replace function public.enqueue_job(p_kind text, p_client_id uuid, p_payload jsonb default '{}')
returns public.jobs
language sql
security definer
set search_path = public
as $$
  insert into public.jobs (kind, client_id, requested_by, payload)
  values (p_kind, p_client_id, auth.uid(), coalesce(p_payload, '{}'))
  returning *;
$$;

revoke execute on function public.enqueue_job(text, uuid, jsonb) from public, authenticated;

-- A round trip through the worker, so a Platform Administrator can confirm the
-- worker is running in an environment.
create or replace function public.request_health_check()
returns public.jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.jobs;
begin
  if not public.is_platform_admin() then
    raise exception 'Only a Platform Administrator can run a health check' using errcode = '42501';
  end if;
  v_job := public.enqueue_job('health_check', null, '{}');
  perform public.record_audit('job.enqueue', null, 'job', v_job.id::text, jsonb_build_object('kind', 'health_check'));
  return v_job;
end;
$$;

grant execute on function public.request_health_check() to authenticated;

-- ============================================================================
-- Worker functions. Running jobs whose lock is older than the timeout are
-- assumed abandoned (the worker crashed or was replaced) and are claimed again.
-- ============================================================================
create or replace function public.claim_jobs(p_worker text, p_limit int default 1, p_lock_timeout interval default '15 minutes')
returns setof public.jobs
language sql
security definer
set search_path = public
as $$
  update public.jobs j
  set status = 'running', attempts = j.attempts + 1, locked_by = p_worker, locked_at = now()
  where j.id in (
    select id from public.jobs
    where (status = 'queued' and run_after <= now())
       or (status = 'running' and locked_at < now() - p_lock_timeout)
    order by run_after
    for update skip locked
    limit greatest(p_limit, 1)
  )
  returning j.*;
$$;

create or replace function public.finish_job(p_job_id uuid, p_worker text, p_result jsonb default '{}')
returns void
language sql
security definer
set search_path = public
as $$
  update public.jobs
  set status = 'succeeded', result = p_result, finished_at = now(), locked_by = null, locked_at = null
  where id = p_job_id and status = 'running' and locked_by = p_worker;
$$;

-- Retries with exponential backoff (1, 2, 4… minutes) until max_attempts.
create or replace function public.fail_job(p_job_id uuid, p_worker text, p_error text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.jobs
  set status = case when attempts >= max_attempts then 'failed' else 'queued' end,
      run_after = case when attempts >= max_attempts then run_after
                       else now() + (power(2, attempts - 1) || ' minutes')::interval end,
      finished_at = case when attempts >= max_attempts then now() end,
      last_error = left(p_error, 4000),
      locked_by = null,
      locked_at = null
  where id = p_job_id and status = 'running' and locked_by = p_worker;
$$;

revoke execute on function
  public.claim_jobs(text, int, interval),
  public.finish_job(uuid, text, jsonb),
  public.fail_job(uuid, text, text)
  from public, authenticated;
grant execute on function
  public.claim_jobs(text, int, interval),
  public.finish_job(uuid, text, jsonb),
  public.fail_job(uuid, text, text)
  to worker;
