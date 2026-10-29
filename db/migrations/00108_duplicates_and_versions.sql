-- Knowledge library: duplicates and versions
--
-- Kelly decided (2026-10-29), always within one client (or, outside clients,
-- among RevTech's own documents):
--
--   * An exact copy of a file already in the library is refused, naming the
--     document when the uploader can see it.
--   * A file that looks like an updated copy (same name once version words
--     are ignored, or mostly the same text) is uploaded, then offered as a
--     newer version: make it the next version, keep it separate, or remove it.
--     The worker compares after reading the file (worker/extract/similar.ts).
--   * A new version can also be uploaded on purpose, with a note of what
--     changed. Older versions stay in the history, and the newest is what
--     search and AI use.
--
-- A new version goes back to Draft and Human Approval Required: approval was
-- given to the old content, not the new.

alter table public.source_files
  -- Set when the file is uploaded as a new version of an existing document.
  add column target_asset_id uuid references public.knowledge_assets(id) on delete set null,
  add column change_note text check (length(change_note) <= 500);

create table public.duplicate_candidates (
  id                 uuid primary key default gen_random_uuid(),
  -- The new upload, and the document already in the library it resembles.
  asset_id           uuid not null references public.knowledge_assets(id) on delete cascade,
  existing_asset_id  uuid not null references public.knowledge_assets(id) on delete cascade,
  same_name          boolean not null,
  -- Share of the two texts' five-word sequences in common (0 to 1).
  text_similarity    real not null check (text_similarity between 0 and 1),
  status             text not null default 'open' check (status in ('open', 'separate', 'removed')),
  resolved_by        uuid references public.profiles(id),
  resolved_at        timestamptz,
  created_at         timestamptz not null default now(),
  unique (asset_id, existing_asset_id),
  check (asset_id <> existing_asset_id)
);

alter table public.duplicate_candidates enable row level security;
-- Seen by whoever can see both documents.
create policy duplicate_candidates_select on public.duplicate_candidates for select
  using (
    exists (select 1 from public.knowledge_assets a where a.id = asset_id)
    and exists (select 1 from public.knowledge_assets b where b.id = existing_asset_id)
  );
revoke insert, update, delete on public.duplicate_candidates from authenticated;

-- ============================================================================
-- Helpers
-- ============================================================================

-- can_read_asset() for someone other than the caller: the server completes
-- uploads as service_role, but what it may say depends on who uploaded.
create or replace function public.profile_can_read_asset(p_profile_id uuid, p_asset_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claims text := current_setting('request.jwt.claims', true);
  v_asset public.knowledge_assets;
  v_result boolean;
begin
  select * into v_asset from public.knowledge_assets where id = p_asset_id;
  if not found then
    return false;
  end if;
  perform set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', p_profile_id)::text, true);
  v_result := public.can_read_asset(v_asset.scope, v_asset.client_id, v_asset.id, v_asset.workstream_ids, v_asset.created_by);
  perform set_config('request.jwt.claims', coalesce(v_claims, ''), true);
  return v_result;
end;
$$;

revoke execute on function public.profile_can_read_asset(uuid, uuid) from public, authenticated;

-- A document in the same library (same client, or outside clients) with a
-- version whose file has this content. Archived documents don't count.
create or replace function public.find_exact_duplicate(p_client_id uuid, p_sha256 text)
returns table (asset_id uuid, title text, version_no int, is_current boolean)
language sql
security definer
stable
set search_path = public
as $$
  select a.id, a.title, v.version_no, a.current_version_id = v.id
  from public.knowledge_assets a
  join public.knowledge_asset_versions v on v.asset_id = a.id
  join public.source_files f on f.id = v.source_file_id
  where a.client_id is not distinct from p_client_id
    and a.lifecycle_status <> 'archived'
    and f.sha256 = lower(p_sha256) and f.upload_status = 'stored'
  order by (a.current_version_id = v.id) desc, a.created_at;
$$;

revoke execute on function public.find_exact_duplicate(uuid, text) from public, authenticated;

-- Who may add a version to a document: a client's Training Administrators and
-- Contributors (who can see it); outside clients, Global Knowledge Administrators.
create or replace function public.can_add_version(p_asset public.knowledge_assets)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.can_read_asset(p_asset.scope, p_asset.client_id, p_asset.id, p_asset.workstream_ids, p_asset.created_by)
    and case when p_asset.client_id is not null
             then public.has_client_role(p_asset.client_id, 'client_training_admin')
                  or public.has_client_role(p_asset.client_id, 'contributor')
             else public.is_global_knowledge_admin() end;
$$;

revoke execute on function public.can_add_version(public.knowledge_assets) from public, authenticated;

-- ============================================================================
-- Uploads (replace 00103): an optional document to add a version to
-- ============================================================================
drop function public.start_upload(uuid, text, text, bigint);

create function public.start_upload(
  p_client_id uuid, p_filename text, p_mime_type text, p_bytes bigint,
  p_asset_id uuid default null, p_change_note text default null
)
returns public.source_files
language plpgsql
security definer
set search_path = public
as $$
declare
  v_file public.source_files;
  v_asset public.knowledge_assets;
  v_ext text := lower(substring(p_filename from '\.([A-Za-z0-9]+)$'));
  v_max_mb int := (select max_upload_mb from public.platform_settings);
begin
  if not public.is_active_caller() then
    raise exception 'Not signed in or deactivated' using errcode = '42501';
  end if;

  if p_asset_id is not null then
    select * into v_asset from public.knowledge_assets where id = p_asset_id;
    if not found or not public.can_read_asset(v_asset.scope, v_asset.client_id, v_asset.id, v_asset.workstream_ids, v_asset.created_by) then
      raise exception 'No such document' using errcode = 'P0002';
    end if;
    if not public.can_add_version(v_asset) then
      raise exception 'You may not add versions to this document' using errcode = '42501';
    end if;
    if v_asset.lifecycle_status = 'archived' then
      raise exception 'This document is archived' using errcode = '42501';
    end if;
    if v_asset.copied_from_asset_id is not null then
      raise exception 'This is a copy of a client document. Add the new version to the original, then copy it again.'
        using errcode = '42501';
    end if;
    p_client_id := v_asset.client_id;
  end if;

  if p_client_id is not null then
    if not (public.has_client_role(p_client_id, 'client_training_admin')
            or public.has_client_role(p_client_id, 'contributor')) then
      raise exception 'You may not upload files to this client' using errcode = '42501';
    end if;
    if (select status from public.clients where id = p_client_id) = 'archived' then
      raise exception 'This client is archived' using errcode = '42501';
    end if;
  elsif not public.is_global_knowledge_admin() then
    raise exception 'Only Global Knowledge Administrators may upload outside a client' using errcode = '42501';
  end if;

  if coalesce(trim(p_filename), '') = '' or length(p_filename) > 255 then
    raise exception 'A file name of 1 to 255 characters is required' using errcode = '22023';
  end if;
  if v_ext is null or v_ext <> all (array['docx', 'pptx', 'xlsx', 'pdf', 'png', 'jpg', 'jpeg', 'txt', 'csv']) then
    raise exception '% files are not supported yet. Upload Word, PowerPoint, Excel, PDF, PNG, JPG, TXT or CSV.',
      coalesce(upper(v_ext), 'These') using errcode = '22023';
  end if;
  if p_bytes is null or p_bytes <= 0 then
    raise exception 'The file is empty' using errcode = '22023';
  end if;
  if p_bytes > v_max_mb::bigint * 1024 * 1024 then
    raise exception 'Files may be up to % MB', v_max_mb using errcode = '22023';
  end if;
  if length(p_change_note) > 500 then
    raise exception 'Keep the note of what changed to 500 characters' using errcode = '22023';
  end if;

  insert into public.source_files (client_id, blob_path, filename, mime_type, bytes, uploaded_by, target_asset_id, change_note)
  values (p_client_id, '', trim(p_filename), nullif(trim(p_mime_type), ''), p_bytes, auth.uid(),
          p_asset_id, nullif(trim(p_change_note), ''))
  returning * into v_file;

  update public.source_files
  set blob_path = coalesce('clients/' || p_client_id::text, 'pending') || '/' || v_file.id::text
  where id = v_file.id
  returning * into v_file;
  return v_file;
end;
$$;

grant execute on function public.start_upload(uuid, text, text, bigint, uuid, text) to authenticated;

-- Server only: the blob is written. Refuses an exact copy of a file already in
-- the library; otherwise creates the document and version 1, or the next
-- version of the document the file was uploaded to. Queues the scan.
create or replace function public.complete_upload(p_file_id uuid, p_bytes bigint, p_sha256 text)
returns public.knowledge_assets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_file public.source_files;
  v_asset public.knowledge_assets;
  v_dup record;
  v_version_id uuid;
  v_version_no int;
  v_classification text;
begin
  update public.source_files
  set upload_status = 'stored', bytes = p_bytes, sha256 = lower(p_sha256)
  where id = p_file_id and upload_status = 'uploading'
  returning * into v_file;
  if not found then
    raise exception 'No upload in progress with that id' using errcode = 'P0002';
  end if;

  select * into v_dup from public.find_exact_duplicate(v_file.client_id, p_sha256) d
  where d.asset_id is distinct from v_file.target_asset_id or d.is_current
  order by d.is_current desc
  limit 1;
  if found then
    if v_dup.asset_id = v_file.target_asset_id then
      raise exception 'This file is the same as the current version of "%". Nothing was added.', v_dup.title
        using errcode = '23505';
    elsif public.profile_can_read_asset(v_file.uploaded_by, v_dup.asset_id) then
      raise exception 'The library already has this file: "%"%. Nothing was added.', v_dup.title,
        case when v_dup.is_current then '' else format(' (version %s)', v_dup.version_no) end
        using errcode = '23505';
    else
      raise exception 'The library already has this file. Nothing was added.' using errcode = '23505';
    end if;
  end if;

  if v_file.target_asset_id is not null then
    select * into v_asset from public.knowledge_assets where id = v_file.target_asset_id for update;
    if not found or v_asset.lifecycle_status = 'archived' then
      raise exception 'The document this version was for no longer exists' using errcode = 'P0002';
    end if;
    select coalesce(max(version_no), 0) + 1 into v_version_no from public.knowledge_asset_versions where asset_id = v_asset.id;

    insert into public.knowledge_asset_versions (asset_id, version_no, source_file_id, change_note, created_by)
    values (v_asset.id, v_version_no, v_file.id, coalesce(v_file.change_note, 'New version uploaded'), v_file.uploaded_by)
    returning id into v_version_id;

    update public.knowledge_assets
    set current_version_id = v_version_id,
        approval_status = 'draft',
        ai_use = case when ai_use = 'not_approved' then ai_use else 'human_approval_required' end
    where id = v_asset.id
    returning * into v_asset;

    insert into public.audit_events (actor_id, client_id, action, target_type, target_id, details)
    values (v_file.uploaded_by, v_file.client_id, 'asset.new_version', 'knowledge_asset', v_asset.id::text,
            jsonb_build_object('version_no', v_version_no, 'filename', v_file.filename, 'bytes', p_bytes,
                               'sha256', lower(p_sha256), 'note', v_file.change_note));
  else
    if v_file.client_id is not null then
      -- Client Confidential, or the client's ceiling if that is lower.
      select case when public.classification_rank(max_classification) < public.classification_rank('client_confidential')
                  then max_classification else 'client_confidential' end
      into v_classification
      from public.clients where id = v_file.client_id;
    else
      v_classification := 'internal';
    end if;

    insert into public.knowledge_assets (client_id, scope, title, security_classification, ai_use, owner_id, created_by)
    values (
      v_file.client_id,
      case when v_file.client_id is null then 'pending_classification' else 'client' end,
      regexp_replace(v_file.filename, '\.[A-Za-z0-9]+$', ''),
      v_classification,
      case when v_file.client_id is null then 'not_approved' else 'human_approval_required' end,
      v_file.uploaded_by,
      v_file.uploaded_by
    )
    returning * into v_asset;

    insert into public.knowledge_asset_versions (asset_id, version_no, source_file_id, change_note, created_by)
    values (v_asset.id, 1, v_file.id, 'Uploaded', v_file.uploaded_by)
    returning id into v_version_id;

    update public.knowledge_assets set current_version_id = v_version_id where id = v_asset.id
    returning * into v_asset;

    insert into public.audit_events (actor_id, client_id, action, target_type, target_id, details)
    values (v_file.uploaded_by, v_file.client_id, 'asset.upload', 'knowledge_asset', v_asset.id::text,
            jsonb_build_object('filename', v_file.filename, 'bytes', p_bytes, 'sha256', lower(p_sha256)));
  end if;

  insert into public.jobs (kind, client_id, requested_by, payload, max_attempts)
  values ('scan_file', v_file.client_id, v_file.uploaded_by, jsonb_build_object('file_id', v_file.id), 10);
  return v_asset;
end;
$$;

-- ============================================================================
-- Worker: finding documents a new upload resembles
-- ============================================================================

-- For version 1 of a new upload (not a copy): the other documents in the same
-- library, with their current text, to compare against. Empty otherwise.
create or replace function public.similarity_candidates(p_version_id uuid)
returns table (asset_id uuid, title text, filename text, text text)
language sql
security definer
stable
set search_path = public
as $$
  with target as (
    select a.* from public.knowledge_asset_versions v join public.knowledge_assets a on a.id = v.asset_id
    where v.id = p_version_id and v.version_no = 1 and a.copied_from_asset_id is null and a.lifecycle_status <> 'archived'
  )
  select a.id, a.title, f.filename,
         left(coalesce((select string_agg(c.text, ' ' order by c.ordinal) from public.source_chunks c
                        where c.asset_version_id = a.current_version_id), ''), 300000)
  from target t
  join public.knowledge_assets a on a.client_id is not distinct from t.client_id and a.id <> t.id
  join public.knowledge_asset_versions v on v.id = a.current_version_id
  join public.source_files f on f.id = v.source_file_id
  where a.lifecycle_status <> 'archived' and a.copied_from_asset_id is null
  order by a.created_at desc
  limit 500;
$$;

-- The documents version p_version_id's upload resembles.
-- p_candidates: [{ "existing_asset_id": "...", "same_name": true, "text_similarity": 0.82 }, ...]
create or replace function public.record_duplicate_candidates(p_version_id uuid, p_candidates jsonb)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  insert into public.duplicate_candidates (asset_id, existing_asset_id, same_name, text_similarity)
  select v.asset_id, (c ->> 'existing_asset_id')::uuid, (c ->> 'same_name')::boolean,
         least(greatest((c ->> 'text_similarity')::real, 0), 1)
  from public.knowledge_asset_versions v, jsonb_array_elements(coalesce(p_candidates, '[]')) c
  where v.id = p_version_id
  on conflict (asset_id, existing_asset_id) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.similarity_candidates(uuid), public.record_duplicate_candidates(uuid, jsonb)
  from public, authenticated;
grant execute on function public.similarity_candidates(uuid), public.record_duplicate_candidates(uuid, jsonb)
  to worker;

-- ============================================================================
-- Resolving a suggestion
--
--   new_version  the upload becomes the next version of the existing document
--                (its file, text and history move there; the upload's own
--                entry goes away)
--   separate     both stay as they are
--   remove       the upload is archived: hidden from the library and search
-- ============================================================================
create or replace function public.resolve_duplicate(p_candidate_id uuid, p_action text)
returns public.knowledge_assets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_candidate public.duplicate_candidates;
  v_new public.knowledge_assets;
  v_existing public.knowledge_assets;
  v_version_id uuid;
  v_version_no int;
begin
  if p_action not in ('new_version', 'separate', 'remove') then
    raise exception 'Unknown choice %', p_action using errcode = '22023';
  end if;
  select * into v_candidate from public.duplicate_candidates where id = p_candidate_id for update;
  if not found then
    raise exception 'No such suggestion' using errcode = 'P0002';
  end if;
  select * into v_new from public.knowledge_assets where id = v_candidate.asset_id for update;
  select * into v_existing from public.knowledge_assets where id = v_candidate.existing_asset_id for update;
  if not (public.can_add_version(v_new) and public.can_add_version(v_existing)) then
    raise exception 'No such suggestion' using errcode = 'P0002';
  end if;
  if v_candidate.status <> 'open' then
    raise exception 'This suggestion has already been dealt with' using errcode = '55000';
  end if;

  if p_action = 'separate' then
    update public.duplicate_candidates set status = 'separate', resolved_by = auth.uid(), resolved_at = now()
    where id = p_candidate_id;
  elsif p_action = 'remove' then
    update public.knowledge_assets set lifecycle_status = 'archived' where id = v_new.id;
    update public.duplicate_candidates set status = 'removed', resolved_by = auth.uid(), resolved_at = now()
    where asset_id = v_new.id and status = 'open';
  else
    if exists (select 1 from public.knowledge_assets where copied_from_asset_id = v_new.id) then
      raise exception 'This upload has been copied to another library. Keep it separate instead.' using errcode = '55000';
    end if;
    v_version_id := v_new.current_version_id;
    select coalesce(max(version_no), 0) + 1 into v_version_no from public.knowledge_asset_versions where asset_id = v_existing.id;

    update public.knowledge_assets set current_version_id = null where id = v_new.id;
    update public.knowledge_asset_versions
    set asset_id = v_existing.id, version_no = v_version_no,
        change_note = 'Uploaded as "' || v_new.title || '"'
    where id = v_version_id;
    update public.source_chunks set asset_id = v_existing.id where asset_version_id = v_version_id;
    update public.knowledge_assets
    set current_version_id = v_version_id,
        approval_status = 'draft',
        ai_use = case when ai_use = 'not_approved' then ai_use else 'human_approval_required' end
    where id = v_existing.id
    returning * into v_existing;
    delete from public.knowledge_assets where id = v_new.id;
  end if;

  insert into public.audit_events (actor_id, client_id, action, target_type, target_id, details)
  values (auth.uid(), v_existing.client_id, 'asset.duplicate_' || p_action, 'knowledge_asset', v_existing.id::text,
          jsonb_build_object('upload_id', v_new.id, 'upload_title', v_new.title, 'version_no', v_version_no,
                             'same_name', v_candidate.same_name, 'text_similarity', v_candidate.text_similarity));
  return case when p_action = 'new_version' then v_existing else v_new end;
end;
$$;

grant execute on function public.resolve_duplicate(uuid, text) to authenticated;
