-- Knowledge library: reading scans and images with AI
--
-- When a file has pages with no text layer, the worker sends them to the
-- model gateway for transcription, as the uploader. The gateway's ai_route()
-- needs the asset's classification and client, so version_to_extract returns
-- them. Kelly decided (2026-10-28) that new uploads may be read this way
-- straight away: it is transcription for search, not use in training, and the
-- classification and client provider checks still apply.

drop function public.version_to_extract(uuid);

create function public.version_to_extract(p_version_id uuid)
returns table (
  blob_path text, filename text, scan_status text, extraction_status text,
  client_id uuid, security_classification text
)
language sql
security definer
stable
set search_path = public
as $$
  select f.blob_path, f.filename, f.scan_status, v.extraction_status, a.client_id, a.security_classification
  from public.knowledge_asset_versions v
  join public.knowledge_assets a on a.id = v.asset_id
  join public.source_files f on f.id = v.source_file_id
  where v.id = p_version_id and f.upload_status = 'stored';
$$;

revoke execute on function public.version_to_extract(uuid) from public, authenticated;
grant execute on function public.version_to_extract(uuid) to worker;
