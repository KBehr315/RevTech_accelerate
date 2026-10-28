-- Knowledge library, part 1: uploads, assets and versions
--
-- docs/platform/04-knowledge-management.md. A file arrives through the API
-- server (PUT /api/upload), which streams it to Blob Storage:
--
--   1. start_upload()     as the person uploading: permission and size checks,
--                         a source_files row and the blob path to write to
--   2. the server writes the blob and computes its SHA-256
--   3. complete_upload()  as service_role (the server): records size and hash,
--                         creates the asset and version 1 with the defaults
--                         below, and queues a malware scan
--
-- Defaults are set here, never by the browser: from a client workspace an
-- upload is Client-Specific, Draft, Active, Human Approval Required, at the
-- client's highest classification up to Client Confidential; from outside one
-- it waits in Pending Classification and may not be used by AI.
--
-- Nothing is extracted or downloadable until the scan says clean. In preview,
-- a Platform Administrator may turn scanning off; files are then marked
-- not_scanned, which shows wherever the file does.

alter table public.platform_settings
  add column malware_scanning text not null default 'defender' check (malware_scanning in ('defender', 'off')),
  add column max_upload_mb int not null default 100 check (max_upload_mb between 1 and 500),
  -- Scanning may only be off in preview, which holds fictional data only.
  add constraint malware_scanning_off_only_in_preview check (malware_scanning = 'defender' or environment_name = 'preview');

grant update (session_idle_minutes, malware_scanning) on public.platform_settings to authenticated;

-- ============================================================================
-- Tables
-- ============================================================================
create table public.source_files (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid references public.clients(id) on delete cascade,
  blob_path      text not null unique,
  filename       text not null,
  mime_type      text,
  bytes          bigint check (bytes >= 0),
  sha256         text check (sha256 ~ '^[0-9a-f]{64}$'),
  upload_status  text not null default 'uploading' check (upload_status in ('uploading', 'stored', 'failed')),
  scan_status    text not null default 'pending'
    check (scan_status in ('pending', 'clean', 'infected', 'failed', 'not_scanned')),
  scanned_at     timestamptz,
  uploaded_by    uuid not null references public.profiles(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index source_files_client_sha_idx on public.source_files(client_id, sha256);

create table public.knowledge_assets (
  id                       uuid primary key default gen_random_uuid(),
  client_id                uuid references public.clients(id) on delete cascade,
  scope                    text not null check (scope in ('global', 'shared', 'client', 'pending_classification')),
  title                    text not null,
  document_type            text,
  security_classification  text not null check (public.classification_rank(security_classification) is not null),
  lifecycle_status         text not null default 'active'
    check (lifecycle_status in ('active', 'superseded', 'expired', 'archived')),
  approval_status          text not null default 'draft'
    check (approval_status in ('draft', 'in_review', 'approved', 'rejected')),
  ai_use                   text not null
    check (ai_use in ('generation', 'reference', 'human_approval_required', 'not_approved')),
  workstream_ids           uuid[] not null default '{}',
  owner_id                 uuid references public.profiles(id),
  current_version_id       uuid,
  created_by               uuid references public.profiles(id),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  -- Client-Specific assets belong to exactly one client; nothing else belongs to any.
  check ((scope = 'client') = (client_id is not null))
);

create index knowledge_assets_client_idx on public.knowledge_assets(client_id, created_at desc);

create table public.knowledge_asset_versions (
  id                 uuid primary key default gen_random_uuid(),
  asset_id           uuid not null references public.knowledge_assets(id) on delete cascade,
  version_no         int not null check (version_no > 0),
  -- Null for a metadata-only version.
  source_file_id     uuid references public.source_files(id),
  metadata           jsonb not null default '{}',
  change_note        text,
  extraction_status  text not null default 'pending'
    check (extraction_status in ('pending', 'running', 'done', 'failed', 'skipped')),
  created_by         uuid references public.profiles(id),
  created_at         timestamptz not null default now(),
  unique (asset_id, version_no)
);

alter table public.knowledge_assets
  add constraint knowledge_assets_current_version_id_fkey
  foreign key (current_version_id) references public.knowledge_asset_versions(id);

create trigger set_updated_at before update on public.source_files
for each row execute function public.handle_updated_at();
create trigger set_updated_at before update on public.knowledge_assets
for each row execute function public.handle_updated_at();

-- An asset may not hold more than the environment allows, nor, for a
-- Client-Specific asset, more than its client allows.
create or replace function public.check_asset_classification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rank int := public.classification_rank(new.security_classification);
begin
  if v_rank > (select public.classification_rank(max_classification) from public.platform_settings) then
    raise exception '% content may not be stored in this environment', new.security_classification
      using errcode = '42501';
  end if;
  if new.client_id is not null and v_rank > (
    select public.classification_rank(max_classification) from public.clients where id = new.client_id
  ) then
    raise exception '% exceeds what this client allows', new.security_classification using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger knowledge_assets_check_classification before insert or update on public.knowledge_assets
for each row execute function public.check_asset_classification();

-- ============================================================================
-- Who may read an asset
--
--   Client-Specific: the client's Client Training Administrators; Contributors
--     and Reviewers with a work grant on the asset or one of its workstreams;
--     and the person who uploaded it, while still a member.
--   Global: Global Knowledge Administrators, and anyone who authors or reviews
--     for at least one client (learners see published training, not sources).
--   Pending Classification: Global Knowledge Administrators and the uploader.
--   Shared: Global Knowledge Administrators, until audiences arrive.
-- Platform Administrators get nothing here by role: client content is for
-- the client's members.
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
      public.is_global_knowledge_admin()
      or exists (
        select 1 from public.client_memberships m join public.profiles p on p.id = m.profile_id
        where m.profile_id = auth.uid() and m.is_active and p.is_active
          and m.roles && array['client_training_admin', 'contributor', 'reviewer']
      )
    when 'pending_classification' then
      public.is_global_knowledge_admin() or (p_created_by = auth.uid() and public.is_active_caller())
    else public.is_global_knowledge_admin()
  end;
$$;

alter table public.source_files enable row level security;
alter table public.knowledge_assets enable row level security;
alter table public.knowledge_asset_versions enable row level security;

create policy knowledge_assets_select on public.knowledge_assets for select
  using (public.can_read_asset(scope, client_id, id, workstream_ids, created_by));

create policy knowledge_asset_versions_select on public.knowledge_asset_versions for select
  using (exists (select 1 from public.knowledge_assets a where a.id = asset_id));

-- A file is visible through an asset version you can see, or while you are uploading it.
create policy source_files_select on public.source_files for select
  using (
    (uploaded_by = auth.uid() and upload_status <> 'stored')
    or exists (select 1 from public.knowledge_asset_versions v where v.source_file_id = source_files.id)
  );

revoke insert, update, delete on public.source_files, public.knowledge_assets, public.knowledge_asset_versions
  from authenticated;

-- ============================================================================
-- Upload commands
-- ============================================================================
create or replace function public.start_upload(p_client_id uuid, p_filename text, p_mime_type text, p_bytes bigint)
returns public.source_files
language plpgsql
security definer
set search_path = public
as $$
declare
  v_file public.source_files;
  v_ext text := lower(substring(p_filename from '\.([A-Za-z0-9]+)$'));
  v_max_mb int := (select max_upload_mb from public.platform_settings);
begin
  if not public.is_active_caller() then
    raise exception 'Not signed in or deactivated' using errcode = '42501';
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

  insert into public.source_files (client_id, blob_path, filename, mime_type, bytes, uploaded_by)
  values (p_client_id, '', trim(p_filename), nullif(trim(p_mime_type), ''), p_bytes, auth.uid())
  returning * into v_file;

  update public.source_files
  set blob_path = coalesce('clients/' || p_client_id::text, 'pending') || '/' || v_file.id::text
  where id = v_file.id
  returning * into v_file;
  return v_file;
end;
$$;

grant execute on function public.start_upload(uuid, text, text, bigint) to authenticated;

-- Server only: the blob is written. Creates the asset and version 1 and queues the scan.
create or replace function public.complete_upload(p_file_id uuid, p_bytes bigint, p_sha256 text)
returns public.knowledge_assets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_file public.source_files;
  v_asset public.knowledge_assets;
  v_version_id uuid;
  v_classification text;
begin
  update public.source_files
  set upload_status = 'stored', bytes = p_bytes, sha256 = lower(p_sha256)
  where id = p_file_id and upload_status = 'uploading'
  returning * into v_file;
  if not found then
    raise exception 'No upload in progress with that id' using errcode = 'P0002';
  end if;

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

  insert into public.jobs (kind, client_id, requested_by, payload, max_attempts)
  values ('scan_file', v_file.client_id, v_file.uploaded_by, jsonb_build_object('file_id', v_file.id), 10);

  insert into public.audit_events (actor_id, client_id, action, target_type, target_id, details)
  values (v_file.uploaded_by, v_file.client_id, 'asset.upload', 'knowledge_asset', v_asset.id::text,
          jsonb_build_object('filename', v_file.filename, 'bytes', p_bytes, 'sha256', lower(p_sha256)));
  return v_asset;
end;
$$;

-- Server only: the blob could not be written.
create or replace function public.fail_upload(p_file_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.source_files set upload_status = 'failed' where id = p_file_id and upload_status = 'uploading';
$$;

revoke execute on function public.complete_upload(uuid, bigint, text), public.fail_upload(uuid)
  from public, authenticated;
grant execute on function public.complete_upload(uuid, bigint, text), public.fail_upload(uuid) to service_role;

-- What the server needs to stream a file to someone who may read it. Runs as
-- the caller, so the source_files policy decides; then the scan must allow it.
create or replace function public.file_for_download(p_file_id uuid)
returns table (blob_path text, filename text, mime_type text)
language plpgsql
stable
set search_path = public
as $$
declare
  v_file public.source_files;
begin
  select * into v_file from public.source_files f where f.id = p_file_id and f.upload_status = 'stored';
  if not found then
    raise exception 'File not found' using errcode = 'P0002';
  end if;
  if v_file.scan_status = 'pending' then
    raise exception 'This file is still being checked for viruses' using errcode = '42501';
  end if;
  if v_file.scan_status not in ('clean', 'not_scanned') then
    raise exception 'This file failed its virus check and cannot be downloaded' using errcode = '42501';
  end if;
  return query select v_file.blob_path, v_file.filename, v_file.mime_type;
end;
$$;

grant execute on function public.file_for_download(uuid) to authenticated;

-- ============================================================================
-- Worker: malware scan results
-- ============================================================================
create or replace function public.file_to_scan(p_file_id uuid)
returns table (blob_path text, scanning text)
language sql
security definer
stable
set search_path = public
as $$
  select f.blob_path, s.malware_scanning
  from public.source_files f, public.platform_settings s
  where f.id = p_file_id and f.upload_status = 'stored';
$$;

create or replace function public.record_scan_result(p_file_id uuid, p_result text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_file public.source_files;
begin
  if p_result not in ('clean', 'infected', 'failed', 'not_scanned') then
    raise exception 'Unknown scan result %', p_result using errcode = '22023';
  end if;
  update public.source_files set scan_status = p_result, scanned_at = now()
  where id = p_file_id and scan_status = 'pending'
  returning * into v_file;
  if found and p_result = 'infected' then
    insert into public.audit_events (actor_id, client_id, action, target_type, target_id, details)
    values (null, v_file.client_id, 'file.infected', 'source_file', v_file.id::text,
            jsonb_build_object('filename', v_file.filename, 'uploaded_by', v_file.uploaded_by));
  end if;
end;
$$;

revoke execute on function public.file_to_scan(uuid), public.record_scan_result(uuid, text) from public, authenticated;
grant execute on function public.file_to_scan(uuid), public.record_scan_result(uuid, text) to worker;
