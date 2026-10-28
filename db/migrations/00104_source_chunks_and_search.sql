-- Knowledge library, part 2: extracted text and keyword search
--
-- Once a file's scan allows it (clean, or not_scanned in preview), the worker
-- reads it (worker/extract/) into source_chunks: passages with a locator that
-- says where they are (page, slide, sheet range, heading path, lines). Search
-- runs over them with Postgres full-text search, as the caller, so RLS on
-- knowledge_assets decides what anyone can find.

alter table public.knowledge_asset_versions
  drop constraint knowledge_asset_versions_extraction_status_check,
  add constraint knowledge_asset_versions_extraction_status_check
    check (extraction_status in ('pending', 'running', 'done', 'failed', 'skipped', 'needs_ocr')),
  -- What was read, or why not: shown next to the file.
  add column extraction_detail text;

create table public.source_chunks (
  id                uuid primary key default gen_random_uuid(),
  asset_version_id  uuid not null references public.knowledge_asset_versions(id) on delete cascade,
  asset_id          uuid not null references public.knowledge_assets(id) on delete cascade,
  client_id         uuid references public.clients(id) on delete cascade,
  ordinal           int not null,
  locator           jsonb not null default '{}',
  text              text not null,
  tsv               tsvector generated always as (to_tsvector('english', text)) stored,
  created_at        timestamptz not null default now(),
  unique (asset_version_id, ordinal)
);

create index source_chunks_tsv_idx on public.source_chunks using gin (tsv);
create index source_chunks_asset_idx on public.source_chunks(asset_id);

alter table public.source_chunks enable row level security;

-- Readable exactly when the asset is (its own RLS applies inside the subquery).
create policy source_chunks_select on public.source_chunks for select
  using (exists (select 1 from public.knowledge_assets a where a.id = asset_id));
revoke insert, update, delete on public.source_chunks from authenticated;

-- ============================================================================
-- Queueing extraction
-- ============================================================================
-- One extract_version job per version backed by the file, as its uploader.
create or replace function public.enqueue_extraction(p_file_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.jobs (kind, client_id, requested_by, payload, max_attempts)
  select 'extract_version', f.client_id, f.uploaded_by, jsonb_build_object('version_id', v.id), 3
  from public.source_files f
  join public.knowledge_asset_versions v on v.source_file_id = f.id
  where f.id = p_file_id and v.extraction_status = 'pending';
$$;

revoke execute on function public.enqueue_extraction(uuid) from public, authenticated;

-- As in 00103, plus: a file that may be read is queued for extraction.
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
  if not found then
    return;
  end if;
  if p_result = 'infected' then
    insert into public.audit_events (actor_id, client_id, action, target_type, target_id, details)
    values (null, v_file.client_id, 'file.infected', 'source_file', v_file.id::text,
            jsonb_build_object('filename', v_file.filename, 'uploaded_by', v_file.uploaded_by));
  elsif p_result in ('clean', 'not_scanned') then
    perform public.enqueue_extraction(v_file.id);
  end if;
end;
$$;

-- Files uploaded before this migration that are already readable.
select public.enqueue_extraction(f.id)
from public.source_files f
where f.upload_status = 'stored' and f.scan_status in ('clean', 'not_scanned');

-- ============================================================================
-- Worker functions
-- ============================================================================
create or replace function public.version_to_extract(p_version_id uuid)
returns table (blob_path text, filename text, scan_status text, extraction_status text)
language sql
security definer
stable
set search_path = public
as $$
  select f.blob_path, f.filename, f.scan_status, v.extraction_status
  from public.knowledge_asset_versions v
  join public.source_files f on f.id = v.source_file_id
  where v.id = p_version_id and f.upload_status = 'stored';
$$;

create or replace function public.set_extraction_status(p_version_id uuid, p_status text, p_detail text default null)
returns void
language sql
security definer
set search_path = public
as $$
  update public.knowledge_asset_versions
  set extraction_status = p_status, extraction_detail = left(p_detail, 2000)
  where id = p_version_id;
$$;

-- Replaces a version's chunks. p_chunks: [{ "text": "...", "locator": {...} }, ...] in order.
create or replace function public.save_extraction(p_version_id uuid, p_status text, p_detail text, p_chunks jsonb)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  delete from public.source_chunks where asset_version_id = p_version_id;
  insert into public.source_chunks (asset_version_id, asset_id, client_id, ordinal, locator, text)
  select v.id, v.asset_id, a.client_id, c.ordinality::int, coalesce(c.value -> 'locator', '{}'), c.value ->> 'text'
  from public.knowledge_asset_versions v
  join public.knowledge_assets a on a.id = v.asset_id,
       jsonb_array_elements(coalesce(p_chunks, '[]')) with ordinality c
  where v.id = p_version_id and coalesce(c.value ->> 'text', '') <> '';
  get diagnostics v_count = row_count;
  perform public.set_extraction_status(p_version_id, p_status, p_detail);
  return v_count;
end;
$$;

revoke execute on function
  public.version_to_extract(uuid), public.set_extraction_status(uuid, text, text),
  public.save_extraction(uuid, text, text, jsonb)
  from public, authenticated;
grant execute on function
  public.version_to_extract(uuid), public.set_extraction_status(uuid, text, text),
  public.save_extraction(uuid, text, text, jsonb)
  to worker;

-- ============================================================================
-- Keyword search
--
-- Runs as the caller, so it finds only what they may read. In a client: that
-- client's assets plus Global ones; with no client (Global context): every
-- asset the caller can see that belongs to no client. Only current versions,
-- and not archived assets. The snippet marks matches with [[ and ]].
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
              else a.client_id = p_client_id or a.scope = 'global' end)
  order by ts_rank_cd(c.tsv, q.query) desc, a.title, c.ordinal
  limit least(greatest(coalesce(p_limit, 30), 1), 100);
$$;

grant execute on function public.search_library(uuid, text, int) to authenticated;
