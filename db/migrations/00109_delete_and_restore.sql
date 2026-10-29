-- Knowledge library: deleting and restoring documents
--
-- Deleting is soft: the document is archived (hidden from the library, search,
-- duplicate checks and AI) and goes to a "Deleted" list it can be restored
-- from. The same people who may add versions may delete and restore: a
-- client's Training Administrators and Contributors; outside clients, Global
-- Knowledge Administrators (can_add_version, 00108).
--
-- Copies made with copy_asset (00106) stay when their original is deleted,
-- and are marked (original_deleted_at) so the library can flag them.

alter table public.knowledge_assets
  add column deleted_at timestamptz,
  add column deleted_by uuid references public.profiles (id),
  add column original_deleted_at timestamptz;

comment on column public.knowledge_assets.deleted_by is
  'Who deleted the document. Null on a document archived another way (a removed duplicate, 00108).';
comment on column public.knowledge_assets.original_deleted_at is
  'On a copy (copied_from_asset_id): when its original was deleted. Null while the original is in the library.';

-- Copies follow their original's archived state, however it was archived.
create or replace function public.mark_copies_of_deleted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (old.lifecycle_status = 'archived') is distinct from (new.lifecycle_status = 'archived') then
    update public.knowledge_assets
    set original_deleted_at = case when new.lifecycle_status = 'archived' then now() end
    where copied_from_asset_id = new.id;
  end if;
  return null;
end;
$$;

revoke execute on function public.mark_copies_of_deleted() from public, authenticated;

create trigger knowledge_assets_mark_copies after update of lifecycle_status on public.knowledge_assets
  for each row execute function public.mark_copies_of_deleted();

-- The document, locked, if the caller may delete or restore it.
create or replace function public.asset_for_deletion(p_asset_id uuid)
returns public.knowledge_assets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_asset public.knowledge_assets;
begin
  select * into v_asset from public.knowledge_assets where id = p_asset_id for update;
  if not found or not public.can_read_asset(v_asset.scope, v_asset.client_id, v_asset.id, v_asset.workstream_ids, v_asset.created_by) then
    raise exception 'No such document' using errcode = 'P0002';
  end if;
  if not public.can_add_version(v_asset) then
    if v_asset.client_id is not null then
      raise exception 'Only Client Training Administrators and Contributors may delete or restore documents' using errcode = '42501';
    end if;
    raise exception 'Only Global Knowledge Administrators may delete or restore this document' using errcode = '42501';
  end if;
  return v_asset;
end;
$$;

revoke execute on function public.asset_for_deletion(uuid) from public, authenticated;

create or replace function public.delete_asset(p_asset_id uuid)
returns public.knowledge_assets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_asset public.knowledge_assets := public.asset_for_deletion(p_asset_id);
begin
  if v_asset.lifecycle_status = 'archived' then
    raise exception 'This document is already deleted' using errcode = '55000';
  end if;

  update public.knowledge_assets
  set lifecycle_status = 'archived', deleted_at = now(), deleted_by = auth.uid()
  where id = v_asset.id
  returning * into v_asset;

  insert into public.audit_events (actor_id, client_id, action, target_type, target_id, details)
  values (auth.uid(), v_asset.client_id, 'asset.delete', 'knowledge_asset', v_asset.id::text,
          jsonb_build_object('title', v_asset.title, 'scope', v_asset.scope));
  return v_asset;
end;
$$;

grant execute on function public.delete_asset(uuid) to authenticated;

-- Restoring refuses a document whose file is now in the library again
-- (uploaded after it was deleted), as an upload of that file would be.
create or replace function public.restore_asset(p_asset_id uuid)
returns public.knowledge_assets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_asset public.knowledge_assets := public.asset_for_deletion(p_asset_id);
  v_sha text;
  v_other record;
begin
  if v_asset.lifecycle_status <> 'archived' then
    raise exception 'This document is not deleted' using errcode = '55000';
  end if;

  select f.sha256 into v_sha
  from public.knowledge_asset_versions v join public.source_files f on f.id = v.source_file_id
  where v.id = v_asset.current_version_id;
  select * into v_other from public.find_exact_duplicate(v_asset.client_id, v_sha) d
  where d.asset_id <> v_asset.id and v_asset.copied_from_asset_id is null
  limit 1;
  if found then
    raise exception 'The library already has this file: "%". Delete that one first if you want this one back.', v_other.title
      using errcode = '23505';
  end if;

  update public.knowledge_assets
  set lifecycle_status = 'active', deleted_at = null, deleted_by = null
  where id = v_asset.id
  returning * into v_asset;

  insert into public.audit_events (actor_id, client_id, action, target_type, target_id, details)
  values (auth.uid(), v_asset.client_id, 'asset.restore', 'knowledge_asset', v_asset.id::text,
          jsonb_build_object('title', v_asset.title, 'scope', v_asset.scope));
  return v_asset;
end;
$$;

grant execute on function public.restore_asset(uuid) to authenticated;
