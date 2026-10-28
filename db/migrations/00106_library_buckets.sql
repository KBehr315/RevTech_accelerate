-- Knowledge library: the four buckets
--
-- Kelly decided (2026-10-28) that every document sits in exactly one bucket:
--
--   Global             every client (its authors and reviewers)
--   Shared             the clients and client groups chosen for it
--   Client             one client
--   RevTech Reference  Global Knowledge Administrators only, never any client.
--                      Generation searches it first for every client; content
--                      may be reused, the source client's names and data may not.
--
-- plus Pending Classification until a Global Knowledge Administrator places it.
--
-- Moving: place_asset() moves anything that belongs to no client between
-- Pending, Global, Shared and RevTech Reference.
-- Copying: a client's document never leaves the client. copy_asset() gives
-- RevTech Reference (or Global or Shared) its own copy, linked to the
-- original, with the same file and extracted text.

alter table public.knowledge_assets
  drop constraint knowledge_assets_scope_check,
  add constraint knowledge_assets_scope_check
    check (scope in ('global', 'shared', 'client', 'revtech_reference', 'pending_classification')),
  add column copied_from_asset_id uuid references public.knowledge_assets(id) on delete set null;

create index knowledge_assets_copied_from_idx on public.knowledge_assets(copied_from_asset_id)
  where copied_from_asset_id is not null;

-- Who a Shared asset is shared with: clients, or client groups (and so their members).
create table public.asset_audiences (
  id               uuid primary key default gen_random_uuid(),
  asset_id         uuid not null references public.knowledge_assets(id) on delete cascade,
  client_id        uuid references public.clients(id) on delete cascade,
  client_group_id  uuid references public.client_groups(id) on delete cascade,
  created_at       timestamptz not null default now(),
  check ((client_id is null) <> (client_group_id is null))
);

create unique index asset_audiences_client_idx on public.asset_audiences(asset_id, client_id) where client_id is not null;
create unique index asset_audiences_group_idx on public.asset_audiences(asset_id, client_group_id) where client_group_id is not null;

alter table public.asset_audiences enable row level security;
create policy asset_audiences_select on public.asset_audiences for select using (public.is_global_knowledge_admin());
revoke insert, update, delete on public.asset_audiences from authenticated;

-- Is a Shared asset shared with this client, directly or through a group?
create or replace function public.asset_shared_with(p_asset_id uuid, p_client_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.asset_audiences au
    left join public.client_group_members gm on gm.group_id = au.client_group_id
    where au.asset_id = p_asset_id and coalesce(au.client_id, gm.client_id) = p_client_id
  );
$$;

-- The clients where the caller authors or reviews (learners see published training, not sources).
create or replace function public.authoring_client_ids()
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select m.client_id from public.client_memberships m join public.profiles p on p.id = m.profile_id
  where m.profile_id = auth.uid() and m.is_active and p.is_active
    and m.roles && array['client_training_admin', 'contributor', 'reviewer'];
$$;

-- ============================================================================
-- Who may read an asset (replaces 00103)
--
--   Client: as before.
--   Global: Global Knowledge Administrators, and anyone who authors or
--     reviews for at least one client.
--   Shared: Global Knowledge Administrators, and anyone who authors or
--     reviews for a client it is shared with.
--   RevTech Reference: Global Knowledge Administrators only.
--   Pending Classification: Global Knowledge Administrators and the uploader.
-- ============================================================================
create or replace function public.can_read_asset(
  p_scope text, p_client_id uuid, p_asset_id uuid, p_workstream_ids uuid[], p_created_by uuid
)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select case p_scope
    when 'client' then
      public.has_client_role(p_client_id, 'client_training_admin')
      or (p_created_by = auth.uid() and public.is_client_member(p_client_id))
      or exists (
        select 1 from public.work_grants g
        where g.client_id = p_client_id and g.profile_id = auth.uid()
          and g.capacity = any(public.client_roles(p_client_id))
          and ((g.target_type = 'asset' and g.target_id = p_asset_id)
               or (g.target_type = 'workstream' and g.target_id = any(p_workstream_ids)))
      )
    when 'global' then
      public.is_global_knowledge_admin() or exists (select 1 from public.authoring_client_ids())
    when 'shared' then
      public.is_global_knowledge_admin()
      or exists (select 1 from public.authoring_client_ids() c where public.asset_shared_with(p_asset_id, c))
    when 'pending_classification' then
      public.is_global_knowledge_admin() or (p_created_by = auth.uid() and public.is_active_caller())
    else public.is_global_knowledge_admin()
  end;
$$;

-- ============================================================================
-- Commands
-- ============================================================================

-- Replaces a Shared asset's audiences; at least one is required.
create or replace function public.set_asset_audiences(p_asset_id uuid, p_client_ids uuid[], p_group_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(cardinality(p_client_ids), 0) + coalesce(cardinality(p_group_ids), 0) = 0 then
    raise exception 'Choose at least one client or client group to share with' using errcode = '22023';
  end if;
  delete from public.asset_audiences where asset_id = p_asset_id;
  insert into public.asset_audiences (asset_id, client_id)
  select p_asset_id, c from unnest(coalesce(p_client_ids, '{}')) c group by c;
  insert into public.asset_audiences (asset_id, client_group_id)
  select p_asset_id, g from unnest(coalesce(p_group_ids, '{}')) g group by g;
end;
$$;

revoke execute on function public.set_asset_audiences(uuid, uuid[], uuid[]) from public, authenticated;

-- Moves an asset that belongs to no client into Global, Shared or RevTech
-- Reference (or changes who a Shared asset is shared with). Global Knowledge
-- Administrators only. Leaving Pending makes it usable by AI after human approval.
create or replace function public.place_asset(
  p_asset_id uuid, p_scope text, p_client_ids uuid[] default '{}', p_group_ids uuid[] default '{}'
)
returns public.knowledge_assets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_asset public.knowledge_assets;
  v_from text;
begin
  if not public.is_global_knowledge_admin() then
    raise exception 'Only Global Knowledge Administrators may place library documents' using errcode = '42501';
  end if;
  if p_scope not in ('global', 'shared', 'revtech_reference', 'pending_classification') then
    raise exception 'Unknown library bucket %', p_scope using errcode = '22023';
  end if;

  select * into v_asset from public.knowledge_assets where id = p_asset_id for update;
  if not found then
    raise exception 'No such document' using errcode = 'P0002';
  end if;
  if v_asset.client_id is not null then
    raise exception 'A client''s document stays with the client. Copy it instead.' using errcode = '42501';
  end if;
  v_from := v_asset.scope;

  if p_scope = 'shared' then
    perform public.set_asset_audiences(p_asset_id, p_client_ids, p_group_ids);
  else
    delete from public.asset_audiences where asset_id = p_asset_id;
  end if;

  update public.knowledge_assets
  set scope = p_scope,
      ai_use = case
        when p_scope = 'pending_classification' then 'not_approved'
        when ai_use = 'not_approved' and v_from = 'pending_classification' then 'human_approval_required'
        else ai_use end
  where id = p_asset_id
  returning * into v_asset;

  insert into public.audit_events (actor_id, client_id, action, target_type, target_id, details)
  values (auth.uid(), null, 'asset.place', 'knowledge_asset', p_asset_id::text,
          jsonb_build_object('from', v_from, 'to', p_scope, 'clients', p_client_ids, 'groups', p_group_ids));
  return v_asset;
end;
$$;

grant execute on function public.place_asset(uuid, text, uuid[], uuid[]) to authenticated;

-- Copies a client's document into RevTech Reference, Global or Shared. The
-- client keeps its own; the copy shares the file and its extracted text and
-- remembers where it came from. Needs a Global Knowledge Administrator who can
-- read the original. Global and Shared copies are seen by other clients, so
-- they also need the source client's Client Training Administrator (the
-- client's approval, in one person, until Phase 5's promotion workflow).
create or replace function public.copy_asset(
  p_asset_id uuid, p_scope text, p_client_ids uuid[] default '{}', p_group_ids uuid[] default '{}'
)
returns public.knowledge_assets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source public.knowledge_assets;
  v_version public.knowledge_asset_versions;
  v_copy public.knowledge_assets;
  v_version_id uuid;
  v_client_name text;
begin
  if not public.is_global_knowledge_admin() then
    raise exception 'Only Global Knowledge Administrators may copy documents out of a client' using errcode = '42501';
  end if;
  if p_scope not in ('global', 'shared', 'revtech_reference') then
    raise exception 'Documents can be copied to Global, Shared or RevTech Reference' using errcode = '22023';
  end if;

  select * into v_source from public.knowledge_assets where id = p_asset_id;
  if not found or v_source.scope <> 'client'
     or not public.can_read_asset(v_source.scope, v_source.client_id, v_source.id, v_source.workstream_ids, v_source.created_by) then
    raise exception 'No such client document' using errcode = 'P0002';
  end if;
  if p_scope <> 'revtech_reference' and not public.has_client_role(v_source.client_id, 'client_training_admin') then
    raise exception 'Copying to % needs the client''s Client Training Administrator',
      case p_scope when 'global' then 'Global' else 'Shared' end using errcode = '42501';
  end if;
  if exists (select 1 from public.knowledge_assets where copied_from_asset_id = p_asset_id and scope = p_scope) then
    raise exception 'This document has already been copied there' using errcode = '23505';
  end if;

  select * into v_version from public.knowledge_asset_versions where id = v_source.current_version_id;
  if v_version.extraction_status in ('pending', 'running') then
    raise exception 'Wait until the file has been read, then copy it' using errcode = '55000';
  end if;
  select name into v_client_name from public.clients where id = v_source.client_id;

  insert into public.knowledge_assets (
    client_id, scope, title, document_type, security_classification, ai_use, workstream_ids,
    owner_id, created_by, copied_from_asset_id
  )
  values (
    null, p_scope, v_source.title, v_source.document_type, v_source.security_classification,
    'human_approval_required', '{}', auth.uid(), auth.uid(), v_source.id
  )
  returning * into v_copy;

  if p_scope = 'shared' then
    perform public.set_asset_audiences(v_copy.id, p_client_ids, p_group_ids);
  end if;

  insert into public.knowledge_asset_versions (
    asset_id, version_no, source_file_id, change_note, extraction_status, extraction_detail, created_by
  )
  values (
    v_copy.id, 1, v_version.source_file_id, 'Copied from ' || v_client_name,
    v_version.extraction_status, v_version.extraction_detail, auth.uid()
  )
  returning id into v_version_id;

  insert into public.source_chunks (asset_version_id, asset_id, client_id, ordinal, locator, text)
  select v_version_id, v_copy.id, null, ordinal, locator, text
  from public.source_chunks where asset_version_id = v_version.id;

  update public.knowledge_assets set current_version_id = v_version_id where id = v_copy.id
  returning * into v_copy;

  -- Recorded against the client, so its administrators can see what left.
  insert into public.audit_events (actor_id, client_id, action, target_type, target_id, details)
  values (auth.uid(), v_source.client_id, 'asset.copy', 'knowledge_asset', v_source.id::text,
          jsonb_build_object('to', p_scope, 'copy_id', v_copy.id, 'title', v_source.title,
                             'clients', p_client_ids, 'groups', p_group_ids));
  return v_copy;
end;
$$;

grant execute on function public.copy_asset(uuid, text, uuid[], uuid[]) to authenticated;

-- Copies made from a client's documents: lets the client library show
-- "Copied to RevTech Reference" next to the original. Global Knowledge
-- Administrators see their own copies through RLS anyway; this is for them.
create or replace function public.asset_copies(p_asset_ids uuid[])
returns table (copied_from_asset_id uuid, scope text)
language sql
stable
set search_path = public
as $$
  select copied_from_asset_id, scope from public.knowledge_assets where copied_from_asset_id = any(p_asset_ids);
$$;

grant execute on function public.asset_copies(uuid[]) to authenticated;

-- The Shared assets a client's library shows: those shared with that client.
create or replace function public.client_shared_assets(p_client_id uuid)
returns setof public.knowledge_assets
language sql
stable
set search_path = public
as $$
  select * from public.knowledge_assets a
  where a.scope = 'shared' and public.asset_shared_with(a.id, p_client_id);
$$;

grant execute on function public.client_shared_assets(uuid) to authenticated;

-- ============================================================================
-- Keyword search (replaces 00104)
--
-- In a client: that client's assets, Global, Shared with that client, and
-- RevTech Reference (which RLS shows to Global Knowledge Administrators only).
-- With no client (Global context): every asset the caller can see that
-- belongs to no client.
-- ============================================================================
create or replace function public.search_library(p_client_id uuid, p_query text, p_limit int default 30)
returns table (
  chunk_id uuid, asset_id uuid, title text, scope text, security_classification text,
  approval_status text, lifecycle_status text, ai_use text,
  version_no int, file_id uuid, filename text, locator jsonb, snippet text, rank real
)
language sql
stable
set search_path = public
as $$
  with q as (select websearch_to_tsquery('english', coalesce(p_query, '')) as query)
  select c.id, a.id, a.title, a.scope, a.security_classification,
         a.approval_status, a.lifecycle_status, a.ai_use,
         v.version_no, f.id, f.filename, c.locator,
         ts_headline('english', c.text, q.query,
                     'StartSel=[[, StopSel=]], MaxWords=45, MinWords=20, MaxFragments=2, FragmentDelimiter=" … "'),
         ts_rank_cd(c.tsv, q.query)
  from q, public.source_chunks c
  join public.knowledge_assets a on a.id = c.asset_id and a.current_version_id = c.asset_version_id
  join public.knowledge_asset_versions v on v.id = c.asset_version_id
  join public.source_files f on f.id = v.source_file_id
  where c.tsv @@ q.query
    and a.lifecycle_status <> 'archived'
    and (case when p_client_id is null then a.client_id is null
              else a.client_id = p_client_id
                or a.scope in ('global', 'revtech_reference')
                or (a.scope = 'shared' and public.asset_shared_with(a.id, p_client_id)) end)
  order by ts_rank_cd(c.tsv, q.query) desc, a.title, c.ordinal
  limit least(greatest(coalesce(p_limit, 30), 1), 200);
$$;
