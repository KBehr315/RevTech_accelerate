-- Training generator, part 1: drafts written by AI from a description
--
-- docs/platform/05-content-generator.md, as decided on 2026-11-02 (decision log,
-- "Training generator"). Someone describes the training they want; optionally
-- ticks library documents and adds YouTube links. The worker sends that to the
-- model gateway as the requester and stores one draft: sections, each with the
-- lesson's blocks and the PowerPoint's slides, plus a quiz and review notes.
-- The slide deck and the interactive lesson are both rendered from that draft.
--
--   * Library documents are optional. Ticked ones are what Claude teaches from,
--     first; without any, Claude writes from general knowledge, and code labels
--     every block without a verified citation "AI-generated".
--   * Ticking a document authorizes it for this draft (a document needing human
--     approval is approved for this use by the person ticking it). Documents
--     marked Not approved for AI, deleted ones, and ones the person can't open
--     are refused.
--   * A draft is the requester's own work in progress: Training Administrators
--     see every draft in their client, Contributors their own.

create table public.training_drafts (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid not null references public.clients(id) on delete cascade,
  title          text not null,
  brief          text not null check (length(brief) between 1 and 10000),
  outputs        text[] not null check (cardinality(outputs) > 0 and outputs <@ array['slides', 'lesson']),
  pieces         text[] not null default '{}',
  asset_ids      uuid[] not null default '{}',
  -- [{ "url": "https://www.youtube.com/watch?v=…", "note": "what the video covers" }]
  videos         jsonb not null default '[]' check (jsonb_typeof(videos) = 'array'),
  status         text not null default 'queued' check (status in ('queued', 'generating', 'ready', 'failed')),
  status_detail  text,
  content        jsonb,
  model          text,
  job_id         uuid references public.jobs(id) on delete set null,
  created_by     uuid not null references public.profiles(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index training_drafts_client_idx on public.training_drafts(client_id, created_at desc);

create trigger set_updated_at before update on public.training_drafts
for each row execute function public.handle_updated_at();

alter table public.training_drafts enable row level security;

create policy training_drafts_select on public.training_drafts for select
  using (
    public.has_client_role(client_id, 'client_training_admin')
    or (created_by = auth.uid() and public.has_client_role(client_id, 'contributor'))
  );
revoke insert, update, delete on public.training_drafts from authenticated;

-- The interactive pieces Claude may use in a lesson (the form's checkboxes).
create or replace function public.training_pieces()
returns text[]
language sql
immutable
as $$
  select array['checklist', 'stat', 'reveal', 'hotspot', 'mistake_better', 'info_cards', 'timed_activity',
               'flip_cards', 'expandable', 'drag_drop', 'multiple_choice', 'diagram'];
$$;

grant execute on function public.training_pieces() to authenticated;

-- ============================================================================
-- start_training_draft: checks, records the draft, and queues the writing.
-- Two attempts: a second try covers a dropped connection, not a wrong answer.
-- ============================================================================
create or replace function public.start_training_draft(
  p_client_id uuid, p_brief text, p_outputs text[], p_pieces text[], p_asset_ids uuid[], p_videos jsonb
)
returns public.training_drafts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_brief text := btrim(coalesce(p_brief, ''));
  v_assets uuid[] := array(select distinct unnest(coalesce(p_asset_ids, '{}')));
  v_refused text;
  v_draft public.training_drafts;
  v_job public.jobs;
begin
  if not (public.has_client_role(p_client_id, 'client_training_admin')
          or public.has_client_role(p_client_id, 'contributor')) then
    raise exception 'Only Training Administrators and Contributors can build training here' using errcode = '42501';
  end if;
  if (select status from public.clients where id = p_client_id) = 'archived' then
    raise exception 'This client is archived' using errcode = '42501';
  end if;
  if v_brief = '' then
    raise exception 'Describe what the training should cover.' using errcode = '22023';
  end if;
  if length(v_brief) > 10000 then
    raise exception 'Keep the description under 10,000 characters.' using errcode = '22023';
  end if;
  if cardinality(coalesce(p_outputs, '{}')) = 0 or not (p_outputs <@ array['slides', 'lesson']) then
    raise exception 'Choose a PowerPoint, an interactive lesson, or both.' using errcode = '22023';
  end if;
  if not (coalesce(p_pieces, '{}') <@ public.training_pieces()) then
    raise exception 'Unknown interactive piece.' using errcode = '22023';
  end if;
  if cardinality(v_assets) > 20 then
    raise exception 'Choose at most 20 documents.' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_videos, '[]')) <> 'array' or jsonb_array_length(coalesce(p_videos, '[]')) > 10
     or exists (select 1 from jsonb_array_elements(coalesce(p_videos, '[]')) v
                where coalesce(v->>'url', '') !~ '^https://(www\.|m\.)?(youtube\.com/(watch\?|shorts/|embed/)|youtu\.be/)\S+$') then
    raise exception 'Add up to 10 YouTube links (https://www.youtube.com/… or https://youtu.be/…).' using errcode = '22023';
  end if;

  -- Each document: one the person may open, still in the library, and allowed near AI.
  select string_agg(coalesce(a.title, 'A document'), ', ') into v_refused
  from unnest(v_assets) as wanted(id)
  left join public.knowledge_assets a on a.id = wanted.id
  where a.id is null
     or not public.can_read_asset(a.scope, a.client_id, a.id, a.workstream_ids, a.created_by)
     or a.lifecycle_status = 'archived'
     or a.ai_use = 'not_approved'
     or (a.client_id is not null and a.client_id <> p_client_id);
  if v_refused is not null then
    raise exception 'These documents can''t be used for this training: %', v_refused using errcode = '42501';
  end if;

  insert into public.training_drafts (client_id, title, brief, outputs, pieces, asset_ids, videos, created_by)
  values (p_client_id, left(regexp_replace(v_brief, '\s+', ' ', 'g'), 80), v_brief, p_outputs,
          coalesce(p_pieces, '{}'), v_assets, coalesce(p_videos, '[]'), auth.uid())
  returning * into v_draft;

  v_job := public.enqueue_job('generate_training', p_client_id, jsonb_build_object('draft_id', v_draft.id));
  update public.jobs set max_attempts = 2 where id = v_job.id;
  update public.training_drafts set job_id = v_job.id where id = v_draft.id returning * into v_draft;
  perform public.record_audit('training.start', p_client_id, 'training_draft', v_draft.id::text,
                              jsonb_build_object('outputs', p_outputs, 'documents', cardinality(v_assets)));
  return v_draft;
end;
$$;

revoke execute on function public.start_training_draft(uuid, text, text[], text[], uuid[], jsonb) from public;
grant execute on function public.start_training_draft(uuid, text, text[], text[], uuid[], jsonb) to authenticated;

-- ============================================================================
-- Worker functions
-- ============================================================================

-- The draft to write, and the classification to declare to the gateway: the
-- highest of the documents ticked and of what someone types in this client
-- (Client Confidential, or less if the client allows less).
create or replace function public.training_draft_to_write(p_draft_id uuid)
returns table (id uuid, client_id uuid, brief text, outputs text[], pieces text[], asset_ids uuid[],
               videos jsonb, classification text)
language sql
security definer
stable
set search_path = public
as $$
  select d.id, d.client_id, d.brief, d.outputs, d.pieces, d.asset_ids, d.videos,
         (select c.name from (
            select case when public.classification_rank(cl.max_classification) < public.classification_rank('client_confidential')
                        then cl.max_classification else 'client_confidential' end as name
            union all
            select a.security_classification from public.knowledge_assets a where a.id = any(d.asset_ids)
          ) c order by public.classification_rank(c.name) desc limit 1)
  from public.training_drafts d
  join public.clients cl on cl.id = d.client_id
  where d.id = p_draft_id;
$$;

-- Records progress, the finished draft, or why it failed. Null keeps a value.
create or replace function public.save_training_draft(
  p_draft_id uuid, p_status text, p_detail text, p_title text default null, p_content jsonb default null,
  p_model text default null
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.training_drafts
  set status = p_status,
      status_detail = left(p_detail, 2000),
      title = coalesce(left(p_title, 200), title),
      content = coalesce(p_content, content),
      model = coalesce(p_model, model)
  where id = p_draft_id;
$$;

revoke execute on function
  public.training_draft_to_write(uuid),
  public.save_training_draft(uuid, text, text, text, jsonb, text)
  from public, authenticated;
grant execute on function
  public.training_draft_to_write(uuid),
  public.save_training_draft(uuid, text, text, text, jsonb, text)
  to worker;
