-- "View as": a Platform Administrator previews the platform as one client role
--
-- The API server puts { view_as: { client_id, role } } in the token it mints
-- when the browser asks to preview, and lets only GET requests through, which
-- PostgREST runs in read-only transactions. Here the permission helpers honour
-- the claim, so the preview sees exactly what that role would: no platform
-- roles, and only that role in that one client. A claim from anyone who is
-- not an active Platform Administrator is ignored.

-- The previewed client and role, or nothing when not previewing.
create or replace function public.preview_role()
returns table (client_id uuid, role text)
language sql
security definer
stable
set search_path = public
as $$
  select (c ->> 'client_id')::uuid, c ->> 'role'
  from (select nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'view_as' as c) claims
  where c is not null
    and exists (
      select 1 from public.platform_role_grants g join public.profiles p on p.id = g.profile_id
      where g.profile_id = auth.uid() and g.role = 'platform_admin' and p.is_active
    );
$$;

grant execute on function public.preview_role() to authenticated;

-- As in 00100; while previewing, no platform roles.
create or replace function public.has_platform_role(p_role text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select not exists (select 1 from public.preview_role())
    and exists (
      select 1
      from public.platform_role_grants g
      join public.profiles p on p.id = g.profile_id
      where g.profile_id = auth.uid() and g.role = p_role and p.is_active
    );
$$;

-- As in 00100; while previewing, only the previewed role, in the previewed client.
create or replace function public.client_roles(p_client_id uuid)
returns text[]
language sql
security definer
stable
set search_path = public
as $$
  select case
    when exists (select 1 from public.preview_role()) then
      coalesce((select array[v.role] from public.preview_role() v where v.client_id = p_client_id), '{}')
    else coalesce((
      select m.roles
      from public.client_memberships m
      join public.profiles p on p.id = m.profile_id
      where m.client_id = p_client_id and m.profile_id = auth.uid() and m.is_active and p.is_active
    ), '{}')
  end;
$$;

-- As in 00106, through client_roles so a preview applies.
create or replace function public.authoring_client_ids()
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select c.id from public.clients c
  where c.id in (
      select m.client_id from public.client_memberships m where m.profile_id = auth.uid()
      union
      select v.client_id from public.preview_role() v
    )
    and public.client_roles(c.id) && array['client_training_admin', 'contributor', 'reviewer'];
$$;

-- Starting a preview is recorded. Called without the claim (previews can't write).
create or replace function public.start_preview(p_client_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Only Platform Administrators may preview other roles' using errcode = '42501';
  end if;
  if p_role not in ('learner', 'contributor', 'reviewer', 'lms_admin', 'client_training_admin') then
    raise exception 'Unknown role %', p_role using errcode = '22023';
  end if;
  if not exists (select 1 from public.clients where id = p_client_id) then
    raise exception 'No such client' using errcode = 'P0002';
  end if;
  insert into public.audit_events (actor_id, client_id, action, target_type, target_id, details)
  values (auth.uid(), p_client_id, 'preview.start', 'client', p_client_id::text, jsonb_build_object('role', p_role));
end;
$$;

grant execute on function public.start_preview(uuid, text) to authenticated;
