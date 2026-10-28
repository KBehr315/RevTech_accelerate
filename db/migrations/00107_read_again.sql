-- Knowledge library: "Read again"
--
-- Files uploaded before OCR arrived (00105) were left as needs_ocr, and a
-- read can fail for reasons that later go away (no AI provider allowed yet,
-- a provider outage). request_extraction() queues the current version to be
-- read again, as the caller, so the AI checks apply to them.
--
-- A file can back several versions: a client's original and its copies
-- (copy_asset, 00106). When one is read, the others backed by the same file
-- that have no text yet get the same text, so reading the original also
-- fills its copy in RevTech Reference, and the other way round.

create or replace function public.request_extraction(p_asset_id uuid)
returns public.jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_asset public.knowledge_assets;
  v_version public.knowledge_asset_versions;
  v_job public.jobs;
begin
  select * into v_asset from public.knowledge_assets where id = p_asset_id;
  if not found or not public.can_read_asset(v_asset.scope, v_asset.client_id, v_asset.id, v_asset.workstream_ids, v_asset.created_by) then
    raise exception 'No such document' using errcode = 'P0002';
  end if;
  -- The same people who may send this content to AI (ai_route, 00102).
  if v_asset.client_id is not null then
    if not (public.has_client_role(v_asset.client_id, 'client_training_admin')
            or public.has_client_role(v_asset.client_id, 'contributor')) then
      raise exception 'Only Client Training Administrators and Contributors may have files read again' using errcode = '42501';
    end if;
  elsif not public.is_global_knowledge_admin() then
    raise exception 'Only Global Knowledge Administrators may have this file read again' using errcode = '42501';
  end if;

  select * into v_version from public.knowledge_asset_versions where id = v_asset.current_version_id for update;
  if v_version.source_file_id is null then
    raise exception 'This version has no file to read' using errcode = '22023';
  end if;
  if v_version.extraction_status in ('pending', 'running') then
    raise exception 'This file is already being read' using errcode = '55000';
  end if;

  update public.knowledge_asset_versions
  set extraction_status = 'pending', extraction_detail = null
  where id = v_version.id;

  insert into public.jobs (kind, client_id, requested_by, payload, max_attempts)
  values ('extract_version', v_asset.client_id, auth.uid(), jsonb_build_object('version_id', v_version.id), 3)
  returning * into v_job;

  insert into public.audit_events (actor_id, client_id, action, target_type, target_id, details)
  values (auth.uid(), v_asset.client_id, 'asset.read_again', 'knowledge_asset', v_asset.id::text,
          jsonb_build_object('version_no', v_version.version_no, 'previous_status', v_version.extraction_status));
  return v_job;
end;
$$;

grant execute on function public.request_extraction(uuid) to authenticated;

-- As in 00104, plus: other versions backed by the same file that were not
-- read (needs_ocr or failed) take the same text and status.
create or replace function public.save_extraction(p_version_id uuid, p_status text, p_detail text, p_chunks jsonb)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
  v_twin uuid;
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

  if p_status = 'done' then
    for v_twin in
      select t.id from public.knowledge_asset_versions v
      join public.knowledge_asset_versions t on t.source_file_id = v.source_file_id and t.id <> v.id
      where v.id = p_version_id and t.extraction_status in ('needs_ocr', 'failed')
    loop
      delete from public.source_chunks where asset_version_id = v_twin;
      insert into public.source_chunks (asset_version_id, asset_id, client_id, ordinal, locator, text)
      select v_twin, t.asset_id, a.client_id, c.ordinal, c.locator, c.text
      from public.source_chunks c, public.knowledge_asset_versions t
      join public.knowledge_assets a on a.id = t.asset_id
      where c.asset_version_id = p_version_id and t.id = v_twin;
      perform public.set_extraction_status(v_twin, p_status, p_detail);
    end loop;
  end if;
  return v_count;
end;
$$;
