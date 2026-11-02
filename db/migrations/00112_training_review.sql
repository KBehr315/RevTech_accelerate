-- Training generator: checking and revising a draft, and writing it for its client
--
-- Decided 2026-11-02 (decision log, "Training review"):
--
--   * Training names only the client it is for. Source documents may come from
--     another company (another client, a past project, a parent or subsidiary);
--     Claude writes those references as the client, and the worker replaces any
--     other company name that slips through, including every other client's.
--   * Each lesson piece, slide and quiz question, and each review note, can be
--     ticked as checked by a reviewer. Unchecked AI-generated pieces don't block
--     the download; the page and the deck's speaker notes say they're unchecked.
--   * A piece can be revised two ways: edited by hand (it is then labeled
--     "edited" and counts as checked by the editor), or rewritten by Claude
--     from the reviewer's instruction (its check is cleared, to check again).
--
-- Pieces are addressed by an "id" the worker gives each block, slide and
-- question; review notes by "note:<n>", counted from 0. Drafts written before
-- this migration get ids here.

-- ============================================================================
-- Piece ids
-- ============================================================================

-- Where a piece sits in a draft's content, for jsonb_set; null if it is gone.
create or replace function public.training_part_path(p_content jsonb, p_part_id text)
returns text[]
language plpgsql
immutable
as $$
declare
  s int;
  i int;
  kind text;
begin
  for s in 0 .. coalesce(jsonb_array_length(p_content->'sections'), 0) - 1 loop
    foreach kind in array array['blocks', 'slides'] loop
      for i in 0 .. coalesce(jsonb_array_length(p_content->'sections'->s->kind), 0) - 1 loop
        if p_content->'sections'->s->kind->i->>'id' = p_part_id then
          return array['sections', s::text, kind, i::text];
        end if;
      end loop;
    end loop;
  end loop;
  for i in 0 .. coalesce(jsonb_array_length(p_content->'quiz'), 0) - 1 loop
    if p_content->'quiz'->i->>'id' = p_part_id then
      return array['quiz', i::text];
    end if;
  end loop;
  return null;
end;
$$;

do $$
declare
  d record;
  c jsonb;
  s int;
  i int;
  kind text;
begin
  for d in select id, content from public.training_drafts where content is not null loop
    c := d.content;
    for s in 0 .. coalesce(jsonb_array_length(c->'sections'), 0) - 1 loop
      foreach kind in array array['blocks', 'slides'] loop
        for i in 0 .. coalesce(jsonb_array_length(c->'sections'->s->kind), 0) - 1 loop
          if c->'sections'->s->kind->i->>'id' is null then
            c := jsonb_set(c, array['sections', s::text, kind, i::text, 'id'], to_jsonb(gen_random_uuid()::text));
          end if;
        end loop;
      end loop;
    end loop;
    for i in 0 .. coalesce(jsonb_array_length(c->'quiz'), 0) - 1 loop
      if c->'quiz'->i->>'id' is null then
        c := jsonb_set(c, array['quiz', i::text, 'id'], to_jsonb(gen_random_uuid()::text));
      end if;
    end loop;
    update public.training_drafts set content = c where id = d.id;
  end loop;
end;
$$;

-- ============================================================================
-- Tables
-- ============================================================================

-- One row per piece someone has ticked as checked.
create table public.training_reviews (
  draft_id    uuid not null references public.training_drafts(id) on delete cascade,
  part_id     text not null,
  checked_by  uuid not null references public.profiles(id),
  checked_at  timestamptz not null default now(),
  primary key (draft_id, part_id)
);

-- A reviewer's request for Claude to rewrite one piece.
create table public.training_revisions (
  id           uuid primary key default gen_random_uuid(),
  draft_id     uuid not null references public.training_drafts(id) on delete cascade,
  part_id      text not null,
  instruction  text not null check (length(instruction) between 1 and 2000),
  status       text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  detail       text,
  job_id       uuid references public.jobs(id) on delete set null,
  created_by   uuid not null references public.profiles(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index training_revisions_draft_idx on public.training_revisions(draft_id, created_at desc);

create trigger set_updated_at before update on public.training_revisions
for each row execute function public.handle_updated_at();

-- Both are visible to whoever can see the draft (00111's policy applies inside).
alter table public.training_reviews enable row level security;
alter table public.training_revisions enable row level security;
create policy training_reviews_select on public.training_reviews for select
  using (exists (select 1 from public.training_drafts d where d.id = draft_id));
create policy training_revisions_select on public.training_revisions for select
  using (exists (select 1 from public.training_drafts d where d.id = draft_id));
revoke insert, update, delete on public.training_reviews, public.training_revisions from authenticated;

-- ============================================================================
-- Reviewing: the people who can see a draft can check and revise it
-- ============================================================================

-- The draft, locked, if the caller may review it and it is finished.
create or replace function public.training_draft_to_review(p_draft_id uuid)
returns public.training_drafts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_draft public.training_drafts;
begin
  select * into v_draft from public.training_drafts where id = p_draft_id for update;
  if not found or not (public.has_client_role(v_draft.client_id, 'client_training_admin')
                       or (v_draft.created_by = auth.uid() and public.has_client_role(v_draft.client_id, 'contributor'))) then
    raise exception 'This draft doesn''t exist, or you can''t review it.' using errcode = '42501';
  end if;
  if v_draft.status <> 'ready' or v_draft.content is null then
    raise exception 'The draft isn''t finished yet.' using errcode = '22023';
  end if;
  return v_draft;
end;
$$;

revoke execute on function public.training_draft_to_review(uuid) from public, authenticated;

create or replace function public.check_training_part(p_draft_id uuid, p_part_id text, p_checked boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_draft public.training_drafts := public.training_draft_to_review(p_draft_id);
  v_note int;
begin
  if p_part_id ~ '^note:\d{1,4}$' then
    v_note := substr(p_part_id, 6)::int;
    if v_note >= coalesce(jsonb_array_length(v_draft.content->'review_notes'), 0) then
      raise exception 'That note is no longer in the draft.' using errcode = '22023';
    end if;
  elsif public.training_part_path(v_draft.content, p_part_id) is null then
    raise exception 'That piece is no longer in the draft.' using errcode = '22023';
  end if;

  if p_checked then
    insert into public.training_reviews (draft_id, part_id, checked_by)
    values (p_draft_id, p_part_id, auth.uid())
    on conflict (draft_id, part_id) do update set checked_by = excluded.checked_by, checked_at = now();
  else
    delete from public.training_reviews where draft_id = p_draft_id and part_id = p_part_id;
  end if;
end;
$$;

-- Replaces a piece's text with a reviewer's own. Only fields the piece already
-- has, of the same JSON type, are taken; its id and citations stay, and it is
-- labeled "edited" and checked by the editor.
create or replace function public.edit_training_part(p_draft_id uuid, p_part_id text, p_part jsonb)
returns public.training_drafts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_draft public.training_drafts := public.training_draft_to_review(p_draft_id);
  v_path text[] := public.training_part_path(v_draft.content, p_part_id);
  v_old jsonb;
  v_new jsonb;
begin
  if v_path is null then
    raise exception 'That piece is no longer in the draft.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_part) <> 'object' or length(p_part::text) > 50000 then
    raise exception 'That edit can''t be saved.' using errcode = '22023';
  end if;
  if exists (select 1 from public.training_revisions
             where draft_id = p_draft_id and part_id = p_part_id and status in ('queued', 'running')) then
    raise exception 'Claude is rewriting this piece. Wait for it to finish, then edit it.' using errcode = '22023';
  end if;

  v_old := v_draft.content #> v_path;
  select v_old || coalesce(jsonb_object_agg(key, value), '{}') || jsonb_build_object('label', 'edited')
  into v_new
  from jsonb_each(p_part)
  where key not in ('id', 'label', 'citations') and v_old ? key and jsonb_typeof(v_old->key) = jsonb_typeof(value);

  update public.training_drafts set content = jsonb_set(content, v_path, v_new) where id = p_draft_id
  returning * into v_draft;
  insert into public.training_reviews (draft_id, part_id, checked_by)
  values (p_draft_id, p_part_id, auth.uid())
  on conflict (draft_id, part_id) do update set checked_by = excluded.checked_by, checked_at = now();
  perform public.record_audit('training.edit', v_draft.client_id, 'training_draft', p_draft_id::text,
                              jsonb_build_object('part_id', p_part_id));
  return v_draft;
end;
$$;

-- Queues Claude to rewrite one piece. Two attempts, as for a whole draft.
create or replace function public.revise_training_part(p_draft_id uuid, p_part_id text, p_instruction text)
returns public.training_revisions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_draft public.training_drafts := public.training_draft_to_review(p_draft_id);
  v_instruction text := btrim(coalesce(p_instruction, ''));
  v_revision public.training_revisions;
  v_job public.jobs;
begin
  if public.training_part_path(v_draft.content, p_part_id) is null then
    raise exception 'That piece is no longer in the draft.' using errcode = '22023';
  end if;
  if v_instruction = '' or length(v_instruction) > 2000 then
    raise exception 'Say what should change, in under 2,000 characters.' using errcode = '22023';
  end if;
  if exists (select 1 from public.training_revisions
             where draft_id = p_draft_id and part_id = p_part_id and status in ('queued', 'running')) then
    raise exception 'Claude is already rewriting this piece.' using errcode = '22023';
  end if;

  insert into public.training_revisions (draft_id, part_id, instruction, created_by)
  values (p_draft_id, p_part_id, v_instruction, auth.uid())
  returning * into v_revision;
  v_job := public.enqueue_job('revise_training', v_draft.client_id, jsonb_build_object('revision_id', v_revision.id));
  update public.jobs set max_attempts = 2 where id = v_job.id;
  update public.training_revisions set job_id = v_job.id where id = v_revision.id returning * into v_revision;
  perform public.record_audit('training.revise', v_draft.client_id, 'training_draft', p_draft_id::text,
                              jsonb_build_object('part_id', p_part_id));
  return v_revision;
end;
$$;

revoke execute on function
  public.check_training_part(uuid, text, boolean),
  public.edit_training_part(uuid, text, jsonb),
  public.revise_training_part(uuid, text, text)
  from public;
grant execute on function
  public.check_training_part(uuid, text, boolean),
  public.edit_training_part(uuid, text, jsonb),
  public.revise_training_part(uuid, text, text)
  to authenticated;

-- ============================================================================
-- Worker functions
-- ============================================================================

-- 00111's function, now also with the client's name and every other client's,
-- so the worker can make sure no other client is named.
drop function public.training_draft_to_write(uuid);
create function public.training_draft_to_write(p_draft_id uuid)
returns table (id uuid, client_id uuid, brief text, outputs text[], pieces text[], asset_ids uuid[],
               videos jsonb, classification text, client_name text, other_clients text[])
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
          ) c order by public.classification_rank(c.name) desc limit 1),
         cl.name,
         array(select o.name from public.clients o where o.id <> d.client_id)
  from public.training_drafts d
  join public.clients cl on cl.id = d.client_id
  where d.id = p_draft_id;
$$;

-- A revision to write, with what its draft was written from and its content now.
create or replace function public.training_revision_to_write(p_revision_id uuid)
returns table (revision_id uuid, draft_id uuid, part_id text, instruction text, content jsonb, client_id uuid,
               brief text, outputs text[], pieces text[], asset_ids uuid[], videos jsonb, classification text,
               client_name text, other_clients text[])
language sql
security definer
stable
set search_path = public
as $$
  select r.id, r.draft_id, r.part_id, r.instruction, d.content, w.client_id, w.brief, w.outputs, w.pieces,
         w.asset_ids, w.videos, w.classification, w.client_name, w.other_clients
  from public.training_revisions r
  join public.training_drafts d on d.id = r.draft_id
  cross join lateral public.training_draft_to_write(r.draft_id) w
  where r.id = p_revision_id;
$$;

-- Records a revision's progress. When done, puts the rewritten piece in place
-- (keeping its id), adds any notes, and clears its check.
create or replace function public.save_training_revision(
  p_revision_id uuid, p_status text, p_detail text, p_part jsonb default null, p_notes text[] default '{}'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_revision public.training_revisions;
  v_path text[];
  v_status text := p_status;
  v_detail text := p_detail;
begin
  select * into v_revision from public.training_revisions where id = p_revision_id for update;
  if not found then
    return;
  end if;
  if v_status = 'done' then
    select public.training_part_path(content, v_revision.part_id) into v_path
    from public.training_drafts where id = v_revision.draft_id for update;
    if v_path is null then
      v_status := 'failed';
      v_detail := 'The piece was removed before Claude finished.';
    else
      update public.training_drafts
      set content = jsonb_set(
            jsonb_set(content, v_path, p_part || jsonb_build_object('id', v_revision.part_id)),
            '{review_notes}', coalesce(content->'review_notes', '[]') || to_jsonb(coalesce(p_notes, '{}')))
      where id = v_revision.draft_id;
      delete from public.training_reviews where draft_id = v_revision.draft_id and part_id = v_revision.part_id;
    end if;
  end if;
  update public.training_revisions set status = v_status, detail = left(v_detail, 2000) where id = p_revision_id;
end;
$$;

revoke execute on function
  public.training_draft_to_write(uuid),
  public.training_revision_to_write(uuid),
  public.save_training_revision(uuid, text, text, jsonb, text[])
  from public, authenticated;
grant execute on function
  public.training_draft_to_write(uuid),
  public.training_revision_to_write(uuid),
  public.save_training_revision(uuid, text, text, jsonb, text[])
  to worker;
