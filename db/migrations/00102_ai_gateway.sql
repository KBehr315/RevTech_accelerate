-- Platform: model gateway policy and call log
--
-- Every AI call goes through the gateway in worker/ai/, which asks the
-- database which provider it may use before sending anything
-- (docs/platform/01-architecture.md, "The model gateway"):
--
--   * ai_route() runs as the person the call is for. It refuses unless that
--     person may generate for the client, the content's classification is
--     within the environment's, the client's and the provider's ceilings, and
--     the client allows the provider.
--   * record_ai_call() writes one ai_calls row per attempt, including refusals.
--     Only the worker may write; prompts and completions are not stored here.

create table public.ai_calls (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid references public.clients(id) on delete cascade,
  job_id          uuid references public.jobs(id) on delete set null,
  provider_id     uuid references public.ai_providers(id) on delete set null,
  requested_by    uuid references public.profiles(id),
  purpose         text not null,
  classification  text not null check (public.classification_rank(classification) is not null),
  model           text,
  outcome         text not null check (outcome in ('succeeded', 'refused', 'failed')),
  detail          text,
  input_tokens    int,
  output_tokens   int,
  latency_ms      int,
  created_at      timestamptz not null default now()
);

create index ai_calls_client_idx on public.ai_calls(client_id, created_at desc);

alter table public.ai_calls enable row level security;

-- Your own calls; a client's calls for its Client Training Administrators;
-- platform-level calls for Platform Administrators.
create policy ai_calls_select on public.ai_calls for select
  using (
    requested_by = auth.uid()
    or (client_id is not null and public.has_client_role(client_id, 'client_training_admin'))
    or (client_id is null and public.is_platform_admin())
  );
revoke insert, update, delete on public.ai_calls from authenticated;

-- ============================================================================
-- ai_route: which provider a call may use, or an exception saying why not.
--
-- p_client_id null means platform-level work (Global content, provider tests),
-- open to Platform and Global Knowledge Administrators. p_provider_id picks a
-- provider; otherwise the first allowed one by name. A Platform Administrator
-- may name a disabled provider at platform level, to test it before enabling.
-- ============================================================================
create or replace function public.ai_route(p_client_id uuid, p_classification text, p_provider_id uuid default null)
returns table (id uuid, name text, kind text, config jsonb)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_rank int := public.classification_rank(p_classification);
  v_client public.clients;
begin
  if not public.is_active_caller() then
    raise exception 'Not signed in or deactivated' using errcode = '42501';
  end if;
  if v_rank is null then
    raise exception 'Unknown classification %', p_classification using errcode = '22023';
  end if;
  if v_rank > (select public.classification_rank(max_classification) from public.platform_settings) then
    raise exception '% content may not be sent to an AI provider in this environment', p_classification
      using errcode = '42501';
  end if;

  if p_client_id is null then
    if not (public.is_platform_admin() or public.is_global_knowledge_admin()) then
      raise exception 'Only Platform or Global Knowledge Administrators may use AI outside a client'
        using errcode = '42501';
    end if;
    return query
      select p.id, p.name, p.kind, p.config from public.ai_providers p
      where (p.is_enabled or (p.id = p_provider_id and public.is_platform_admin()))
        and (p_provider_id is null or p.id = p_provider_id)
        and public.classification_rank(p.max_classification) >= v_rank
      order by p.name
      limit 1;
  else
    if not (public.has_client_role(p_client_id, 'client_training_admin')
            or public.has_client_role(p_client_id, 'contributor')) then
      raise exception 'You may not generate content for this client' using errcode = '42501';
    end if;
    select * into v_client from public.clients c where c.id = p_client_id;
    if v_client.status = 'archived' then
      raise exception 'This client is archived' using errcode = '42501';
    end if;
    if v_rank > public.classification_rank(v_client.max_classification) then
      raise exception '% content exceeds what this client allows', p_classification using errcode = '42501';
    end if;
    return query
      select p.id, p.name, p.kind, p.config from public.ai_providers p
      where p.is_enabled
        and p.id = any(v_client.allowed_ai_providers)
        and (p_provider_id is null or p.id = p_provider_id)
        and public.classification_rank(p.max_classification) >= v_rank
      order by p.name
      limit 1;
  end if;

  if not found then
    raise exception 'No enabled AI provider is allowed for % content here', p_classification using errcode = '42501';
  end if;
end;
$$;

revoke execute on function public.ai_route(uuid, text, uuid) from public;
grant execute on function public.ai_route(uuid, text, uuid) to authenticated;

-- Worker only: one row per gateway call. requested_by is passed in because the
-- worker records outside the requester's transaction.
create or replace function public.record_ai_call(
  p_client_id uuid, p_job_id uuid, p_provider_id uuid, p_requested_by uuid, p_purpose text,
  p_classification text, p_model text, p_outcome text, p_detail text,
  p_input_tokens int, p_output_tokens int, p_latency_ms int
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.ai_calls (client_id, job_id, provider_id, requested_by, purpose, classification, model,
                               outcome, detail, input_tokens, output_tokens, latency_ms)
  values (p_client_id, p_job_id, p_provider_id, p_requested_by, p_purpose, p_classification, p_model,
          p_outcome, left(p_detail, 2000), p_input_tokens, p_output_tokens, p_latency_ms);
$$;

revoke execute on function
  public.record_ai_call(uuid, uuid, uuid, uuid, text, text, text, text, text, int, int, int)
  from public, authenticated;
grant execute on function
  public.record_ai_call(uuid, uuid, uuid, uuid, text, text, text, text, text, int, int, int)
  to worker;

-- A one-sentence round trip to a provider, so a Platform Administrator can
-- check its key and model before enabling it. Not retried: a wrong key stays wrong.
create or replace function public.request_ai_provider_test(p_provider_id uuid)
returns public.jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.jobs;
begin
  if not public.is_platform_admin() then
    raise exception 'Only a Platform Administrator can test an AI provider' using errcode = '42501';
  end if;
  if not exists (select 1 from public.ai_providers where id = p_provider_id) then
    raise exception 'No such AI provider' using errcode = 'P0002';
  end if;
  v_job := public.enqueue_job('ai_provider_test', null, jsonb_build_object('provider_id', p_provider_id));
  update public.jobs set max_attempts = 1 where id = v_job.id returning * into v_job;
  perform public.record_audit('job.enqueue', null, 'job', v_job.id::text,
                              jsonb_build_object('kind', 'ai_provider_test', 'provider_id', p_provider_id));
  return v_job;
end;
$$;

grant execute on function public.request_ai_provider_test(uuid) to authenticated;
