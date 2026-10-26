-- Platform: identity, client workspaces, roles, AI provider registry, audit
--
-- First migration of the SAP GovCon training platform (docs/platform/). It
-- replaces the retired compliance LMS, whose migrations are archived under
-- db/migrations/archive/compliance-lms/: on a database that ran them, the
-- compliance objects are dropped here; on a fresh database the drops are no-ops.
--
-- Isolation model (docs/platform/03-security-and-permissions.md):
--   * Every client-owned row carries client_id, and RLS decides visibility from
--     memberships. Which client the UI has selected grants nothing.
--   * Platform roles (platform_admin, global_knowledge_admin, client_creator)
--     never grant access to a client's content by themselves.
--   * State changes that must not be forged go through security-definer
--     functions that re-check permission and write audit_events.

-- ============================================================================
-- Retire the compliance LMS
-- ============================================================================
drop view if exists public.assignment_status;
drop view if exists public.quiz_questions_public;
drop function if exists public.start_attempt(uuid);
drop function if exists public.mark_content_viewed(uuid);
drop function if exists public.submit_attempt(uuid, jsonb);
drop function if exists public.ensure_profile(text, text);
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();
drop table if exists public.attempts, public.assignments, public.quiz_questions, public.modules,
  public.employee_group_members, public.employee_groups, public.profiles cascade;
drop function if exists public.is_admin();

create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================================
-- Classification levels, in ascending order of sensitivity
-- ============================================================================
create or replace function public.classification_rank(p_level text)
returns int
language sql
immutable
as $$
  select array_position(
    array['public', 'internal', 'confidential', 'client_confidential', 'controlled', 'export_controlled'],
    p_level
  )
$$;

-- ============================================================================
-- platform_settings: one row describing this environment
-- ============================================================================
create table public.platform_settings (
  id                  boolean primary key default true check (id),
  environment_name    text not null default 'preview',
  -- Highest classification any workspace in this environment may hold. The
  -- commercial environment stops below 'controlled'; raising it is a migration
  -- that goes with the Government deployment, never an in-app setting.
  max_classification  text not null default 'client_confidential'
    check (public.classification_rank(max_classification) between 1 and 4),
  session_idle_minutes int not null default 30 check (session_idle_minutes between 5 and 480),
  updated_at          timestamptz not null default now()
);

insert into public.platform_settings default values;

-- ============================================================================
-- profiles: one per person who has signed in or been added to a client
-- ============================================================================
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null unique,
  full_name   text not null,
  is_active   boolean not null default true,
  is_guest    boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.platform_role_grants (
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  role        text not null check (role in ('platform_admin', 'global_knowledge_admin', 'client_creator')),
  granted_by  uuid references public.profiles(id),
  granted_at  timestamptz not null default now(),
  primary key (profile_id, role)
);

-- ============================================================================
-- AI provider registry (the model gateway reads this; secrets live in Key Vault)
-- ============================================================================
create table public.ai_providers (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null unique,
  kind                text not null check (kind in ('anthropic', 'bedrock', 'azure_openai')),
  config              jsonb not null default '{}',   -- models, region, endpoint, Key Vault secret name; never a key
  max_classification  text not null default 'internal'
    check (public.classification_rank(max_classification) between 1 and 4),
  -- No provider may process CUI or export-controlled data in this environment.
  -- The Government deployment replaces this check, with a written authorization.
  cui_approved        boolean not null default false check (not cui_approved),
  is_enabled          boolean not null default false,
  retention_terms     text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ============================================================================
-- clients: the Client Workspace root
-- ============================================================================
create table public.clients (
  id                          uuid primary key default gen_random_uuid(),
  name                        text not null,
  slug                        text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  status                      text not null default 'setup' check (status in ('setup', 'active', 'archived')),
  setup_step                  text not null default 'profile'
    check (setup_step in ('profile', 'sap_landscape', 'organization', 'branding', 'governance', 'review')),
  industry                    text,
  govcon_status               text check (govcon_status in ('prime', 'subcontractor', 'both', 'commercial')),
  sap_landscape               jsonb not null default '{}',
  dassian_products            text[] not null default '{}',
  max_classification          text not null default 'client_confidential'
    check (public.classification_rank(max_classification) between 1 and 4),
  allowed_ai_providers        uuid[] not null default '{}',
  branding                    jsonb not null default '{}',
  accessibility_requirements  text,
  export_control_notes        text,
  support_contact             text,
  approval_stages             text[] not null default '{contributor,sme,client}'
    check (approval_stages <@ array['contributor', 'sme', 'client']),
  created_by                  uuid references public.profiles(id),
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create table public.client_memberships (
  client_id   uuid not null references public.clients(id) on delete cascade,
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  roles       text[] not null check (
    cardinality(roles) > 0
    and roles <@ array['client_training_admin', 'lms_admin', 'contributor', 'reviewer', 'learner']
  ),
  is_active   boolean not null default true,
  added_by    uuid references public.profiles(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (client_id, profile_id)
);

create index client_memberships_profile_id_idx on public.client_memberships(profile_id);

-- Narrows Contributors and Reviewers to specific work. target_id points at a
-- module, output, workstream or asset; those tables arrive in later phases, so
-- there is no foreign key here.
create table public.work_grants (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null,
  profile_id   uuid not null,
  capacity     text not null check (capacity in ('contributor', 'reviewer')),
  target_type  text not null check (target_type in ('module', 'output', 'workstream', 'asset')),
  target_id    uuid not null,
  granted_by   uuid references public.profiles(id),
  created_at   timestamptz not null default now(),
  unique (client_id, profile_id, capacity, target_type, target_id),
  foreign key (client_id, profile_id) references public.client_memberships(client_id, profile_id) on delete cascade
);

-- Audiences for Shared/Restricted knowledge, curated by Global Knowledge Administrators.
create table public.client_groups (
  id           uuid primary key default gen_random_uuid(),
  name         text not null unique,
  description  text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.client_group_members (
  group_id   uuid not null references public.client_groups(id) on delete cascade,
  client_id  uuid not null references public.clients(id) on delete cascade,
  primary key (group_id, client_id)
);

-- Client setup data used by generation and assignment.
create table public.client_workstreams (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references public.clients(id) on delete cascade,
  code         text not null,
  name         text not null,
  description  text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (client_id, code)
);

create table public.client_business_roles (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references public.clients(id) on delete cascade,
  name            text not null,
  description     text,
  workstream_ids  uuid[] not null default '{}',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (client_id, name)
);

create table public.client_terms (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid not null references public.clients(id) on delete cascade,
  client_term    text not null,
  standard_term  text,
  definition     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (client_id, client_term)
);

do $$
declare
  tbl text;
begin
  foreach tbl in array array['platform_settings', 'profiles', 'ai_providers', 'clients', 'client_memberships',
                             'client_groups', 'client_workstreams', 'client_business_roles', 'client_terms']
  loop
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.handle_updated_at()', tbl);
  end loop;
end $$;

-- ============================================================================
-- audit_events: append-only. Written by triggers and security-definer
-- functions, never directly by a caller.
-- ============================================================================
create table public.audit_events (
  id           bigint generated always as identity primary key,
  at           timestamptz not null default now(),
  actor_id     uuid,
  client_id    uuid,
  action       text not null,
  target_type  text,
  target_id    text,
  details      jsonb not null default '{}'
);

create index audit_events_client_at_idx on public.audit_events(client_id, at desc);
create index audit_events_at_idx on public.audit_events(at desc);

create or replace function public.reject_audit_change()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_events is append-only';
end;
$$;

create trigger audit_events_append_only
before update or delete on public.audit_events
for each row execute function public.reject_audit_change();

create or replace function public.record_audit(
  p_action text, p_client_id uuid, p_target_type text, p_target_id text, p_details jsonb default '{}'
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.audit_events (actor_id, client_id, action, target_type, target_id, details)
  values (auth.uid(), p_client_id, p_action, p_target_type, p_target_id, coalesce(p_details, '{}'));
$$;

-- Audit trigger for configuration tables: records which columns changed.
create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb := to_jsonb(coalesce(new, old));
  v_changed jsonb;
begin
  if tg_op = 'UPDATE' then
    select coalesce(jsonb_object_agg(n.key, n.value), '{}') into v_changed
    from jsonb_each(to_jsonb(new)) n
    where n.key not in ('updated_at') and n.value is distinct from to_jsonb(old) -> n.key;
    if v_changed = '{}' then
      return new;
    end if;
  else
    v_changed := v_row;
  end if;

  perform public.record_audit(
    tg_table_name || '.' || lower(tg_op),
    case when tg_table_name = 'clients' then (v_row ->> 'id')::uuid else (v_row ->> 'client_id')::uuid end,
    tg_table_name,
    coalesce(v_row ->> 'id', v_row ->> 'profile_id'),
    v_changed
  );
  return coalesce(new, old);
end;
$$;

do $$
declare
  tbl text;
begin
  foreach tbl in array array['platform_settings', 'ai_providers', 'clients', 'work_grants', 'client_groups',
                             'client_group_members', 'client_workstreams', 'client_business_roles', 'client_terms']
  loop
    execute format('create trigger audit_change after insert or update or delete on public.%I for each row execute function public.audit_row_change()', tbl);
  end loop;
end $$;

-- ============================================================================
-- Permission helpers. Security definer so policies can call them without
-- recursing through the membership tables' own policies.
-- ============================================================================
create or replace function public.is_active_caller()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and is_active);
$$;

create or replace function public.has_platform_role(p_role text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.platform_role_grants g
    join public.profiles p on p.id = g.profile_id
    where g.profile_id = auth.uid() and g.role = p_role and p.is_active
  );
$$;

create or replace function public.is_platform_admin()
returns boolean language sql stable as $$ select public.has_platform_role('platform_admin') $$;

create or replace function public.is_global_knowledge_admin()
returns boolean language sql stable as $$ select public.has_platform_role('global_knowledge_admin') $$;

-- Roles the caller holds in a client (empty when not an active member).
create or replace function public.client_roles(p_client_id uuid)
returns text[]
language sql
security definer
stable
set search_path = public
as $$
  select coalesce((
    select m.roles
    from public.client_memberships m
    join public.profiles p on p.id = m.profile_id
    where m.client_id = p_client_id and m.profile_id = auth.uid() and m.is_active and p.is_active
  ), '{}');
$$;

create or replace function public.is_client_member(p_client_id uuid)
returns boolean language sql stable as $$ select cardinality(public.client_roles(p_client_id)) > 0 $$;

create or replace function public.has_client_role(p_client_id uuid, p_role text)
returns boolean language sql stable as $$ select p_role = any(public.client_roles(p_client_id)) $$;

create or replace function public.has_work_grant(p_client_id uuid, p_capacity text, p_target_type text, p_target_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.is_client_member(p_client_id) and exists (
    select 1 from public.work_grants
    where client_id = p_client_id and profile_id = auth.uid()
      and capacity = p_capacity and target_type = p_target_type and target_id = p_target_id
  );
$$;

-- ============================================================================
-- Row-level security
-- ============================================================================
alter table public.platform_settings enable row level security;
alter table public.profiles enable row level security;
alter table public.platform_role_grants enable row level security;
alter table public.ai_providers enable row level security;
alter table public.clients enable row level security;
alter table public.client_memberships enable row level security;
alter table public.work_grants enable row level security;
alter table public.client_groups enable row level security;
alter table public.client_group_members enable row level security;
alter table public.client_workstreams enable row level security;
alter table public.client_business_roles enable row level security;
alter table public.client_terms enable row level security;
alter table public.audit_events enable row level security;

-- platform_settings: everyone signed in may read it (the UI shows the ceiling);
-- Platform Administrators may change the session timeout, nothing else.
create policy platform_settings_select on public.platform_settings for select
  using (public.is_active_caller());
create policy platform_settings_update on public.platform_settings for update
  using (public.is_platform_admin()) with check (public.is_platform_admin());
revoke insert, update, delete on public.platform_settings from authenticated;
grant update (session_idle_minutes) on public.platform_settings to authenticated;

-- profiles: yourself; Platform Administrators; and the Client Training and LMS
-- Administrators of a client the person belongs to. Created and changed only
-- through ensure_profile() and add_client_member().
create policy profiles_select on public.profiles for select
  using (
    id = auth.uid()
    or public.is_platform_admin()
    or exists (
      select 1 from public.client_memberships m
      where m.profile_id = profiles.id
        and (public.has_client_role(m.client_id, 'client_training_admin') or public.has_client_role(m.client_id, 'lms_admin'))
    )
  );
revoke insert, update, delete on public.profiles from authenticated;

-- platform_role_grants: your own, or all for Platform Administrators. Changed
-- only through set_platform_role().
create policy platform_role_grants_select on public.platform_role_grants for select
  using (profile_id = auth.uid() or public.is_platform_admin());
revoke insert, update, delete on public.platform_role_grants from authenticated;

-- ai_providers: Platform Administrators manage; Client Training Administrators
-- see enabled providers so they can choose which their client allows.
create policy ai_providers_select on public.ai_providers for select
  using (
    public.is_platform_admin()
    or (is_enabled and exists (
      select 1 from public.client_memberships m
      where m.profile_id = auth.uid() and 'client_training_admin' = any(m.roles) and m.is_active
    ))
  );
create policy ai_providers_insert on public.ai_providers for insert with check (public.is_platform_admin());
create policy ai_providers_update on public.ai_providers for update
  using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy ai_providers_delete on public.ai_providers for delete using (public.is_platform_admin());

-- clients: members, Platform Administrators, and Global Knowledge Administrators
-- (who need the list to build Shared/Restricted audiences) see the workspace
-- record. That is configuration, not client content. Created through
-- create_client(); status changes through activate_client()/archive_client().
create policy clients_select on public.clients for select
  using (public.is_client_member(id) or public.is_platform_admin() or public.is_global_knowledge_admin());
create policy clients_update on public.clients for update
  using (public.has_client_role(id, 'client_training_admin'))
  with check (public.has_client_role(id, 'client_training_admin'));
revoke insert, update, delete on public.clients from authenticated;
grant update (name, setup_step, industry, govcon_status, sap_landscape, dassian_products, max_classification,
              allowed_ai_providers, branding, accessibility_requirements, export_control_notes, support_contact,
              approval_stages)
  on public.clients to authenticated;

-- A client may not hold more than the environment allows, and may only allow
-- providers that exist and are enabled.
create or replace function public.check_client_limits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.classification_rank(new.max_classification)
     > (select public.classification_rank(max_classification) from public.platform_settings) then
    raise exception 'max_classification % exceeds what this environment allows', new.max_classification;
  end if;
  if exists (
    select 1 from unnest(new.allowed_ai_providers) as pid
    where not exists (select 1 from public.ai_providers where id = pid and is_enabled)
  ) then
    raise exception 'allowed_ai_providers contains a provider that does not exist or is not enabled';
  end if;
  return new;
end;
$$;

create trigger clients_check_limits before insert or update on public.clients
for each row execute function public.check_client_limits();

-- client_memberships: your own rows; all rows of a client for its Client
-- Training and LMS Administrators; Platform Administrators. Changed only
-- through add_client_member()/set_client_roles().
create policy client_memberships_select on public.client_memberships for select
  using (
    profile_id = auth.uid()
    or public.has_client_role(client_id, 'client_training_admin')
    or public.has_client_role(client_id, 'lms_admin')
    or public.is_platform_admin()
  );
revoke insert, update, delete on public.client_memberships from authenticated;

-- work_grants: your own; the client's Client Training Administrators manage them.
create policy work_grants_select on public.work_grants for select
  using ((profile_id = auth.uid() and public.is_client_member(client_id))
         or public.has_client_role(client_id, 'client_training_admin'));
create policy work_grants_insert on public.work_grants for insert
  with check (public.has_client_role(client_id, 'client_training_admin'));
create policy work_grants_delete on public.work_grants for delete
  using (public.has_client_role(client_id, 'client_training_admin'));
revoke update on public.work_grants from authenticated;

-- client groups: Global Knowledge Administrators manage; Platform
-- Administrators read. Client members don't need to see which groups exist.
create policy client_groups_select on public.client_groups for select
  using (public.is_global_knowledge_admin() or public.is_platform_admin());
create policy client_groups_write on public.client_groups for all
  using (public.is_global_knowledge_admin()) with check (public.is_global_knowledge_admin());
create policy client_group_members_select on public.client_group_members for select
  using (public.is_global_knowledge_admin() or public.is_platform_admin());
create policy client_group_members_write on public.client_group_members for all
  using (public.is_global_knowledge_admin()) with check (public.is_global_knowledge_admin());

-- Client setup data: members read; Client Training Administrators write.
do $$
declare
  tbl text;
begin
  foreach tbl in array array['client_workstreams', 'client_business_roles', 'client_terms']
  loop
    execute format('create policy %1$s_select on public.%1$I for select using (public.is_client_member(client_id))', tbl);
    execute format('create policy %1$s_insert on public.%1$I for insert with check (public.has_client_role(client_id, ''client_training_admin''))', tbl);
    execute format('create policy %1$s_update on public.%1$I for update using (public.has_client_role(client_id, ''client_training_admin'')) with check (public.has_client_role(client_id, ''client_training_admin''))', tbl);
    execute format('create policy %1$s_delete on public.%1$I for delete using (public.has_client_role(client_id, ''client_training_admin''))', tbl);
  end loop;
end $$;

-- audit_events: Platform Administrators read platform-level events (no
-- client); a client's Client Training Administrators read that client's events.
create policy audit_events_select on public.audit_events for select
  using (
    (client_id is null and public.is_platform_admin())
    or (client_id is not null and public.has_client_role(client_id, 'client_training_admin'))
  );
revoke insert, update, delete, truncate on public.audit_events from authenticated;

-- ============================================================================
-- Commands
-- ============================================================================

-- The caller's profile, created on first sign-in. Callable only by service_role:
-- the email comes from a Microsoft token the API server has already verified.
create or replace function public.ensure_profile(p_email text, p_name text, p_is_guest boolean default false)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(p_email));
  v_name text := nullif(trim(p_name), '');
  v_user_id uuid;
  v_profile public.profiles;
begin
  insert into auth.users (email, raw_user_meta_data)
  values (v_email, jsonb_build_object('name', v_name))
  on conflict (email) do nothing;
  select id into v_user_id from auth.users where email = v_email;

  insert into public.profiles (id, email, full_name, is_guest)
  values (v_user_id, v_email, coalesce(v_name, v_email), p_is_guest)
  on conflict (id) do update
    -- Profiles added by an administrator before first sign-in start out named after the email.
    set full_name = case when profiles.full_name = profiles.email and v_name is not null then v_name else profiles.full_name end
  returning * into v_profile;

  return v_profile;
end;
$$;

-- Grant or revoke a platform role. Platform Administrators only; nobody may
-- revoke their own platform_admin, so there is always at least one.
create or replace function public.set_platform_role(p_profile_id uuid, p_role text, p_granted boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Only a Platform Administrator can change platform roles' using errcode = '42501';
  end if;
  if p_role = 'platform_admin' and not p_granted and p_profile_id = auth.uid() then
    raise exception 'You cannot remove your own Platform Administrator role';
  end if;

  if p_granted then
    insert into public.platform_role_grants (profile_id, role, granted_by)
    values (p_profile_id, p_role, auth.uid())
    on conflict do nothing;
  else
    delete from public.platform_role_grants where profile_id = p_profile_id and role = p_role;
  end if;

  perform public.record_audit(
    case when p_granted then 'platform_role.grant' else 'platform_role.revoke' end,
    null, 'profile', p_profile_id::text, jsonb_build_object('role', p_role)
  );
end;
$$;

-- Create a client workspace. The creator becomes its first Client Training Administrator.
create or replace function public.create_client(p_name text, p_slug text)
returns public.clients
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client public.clients;
begin
  if not (public.is_platform_admin() or public.has_platform_role('client_creator')) then
    raise exception 'Only a Platform Administrator or an authorized Client Training Administrator can create clients'
      using errcode = '42501';
  end if;

  insert into public.clients (name, slug, created_by)
  values (trim(p_name), lower(trim(p_slug)), auth.uid())
  returning * into v_client;

  insert into public.client_memberships (client_id, profile_id, roles, added_by)
  values (v_client.id, auth.uid(), array['client_training_admin'], auth.uid());

  perform public.record_audit('client_membership.add', v_client.id, 'profile', auth.uid()::text,
                              jsonb_build_object('roles', array['client_training_admin']));
  return v_client;
end;
$$;

-- Add someone to a client by email, creating their profile if they have never
-- signed in (a B2B guest who hasn't redeemed an invitation yet, for example).
-- Client Training Administrators may grant any client role; LMS Administrators
-- may only add learners.
create or replace function public.add_client_member(p_client_id uuid, p_email text, p_name text, p_roles text[])
returns public.client_memberships
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(p_email));
  v_profile_id uuid;
  v_membership public.client_memberships;
begin
  if not (public.has_client_role(p_client_id, 'client_training_admin')
          or (public.has_client_role(p_client_id, 'lms_admin') and p_roles = array['learner'])) then
    raise exception 'You cannot add members with these roles to this client' using errcode = '42501';
  end if;

  insert into auth.users (email, raw_user_meta_data)
  values (v_email, jsonb_build_object('name', nullif(trim(p_name), '')))
  on conflict (email) do nothing;
  select id into v_profile_id from auth.users where email = v_email;

  insert into public.profiles (id, email, full_name, is_guest)
  values (v_profile_id, v_email, coalesce(nullif(trim(p_name), ''), v_email), v_email not like '%@revtech.consulting')
  on conflict (id) do nothing;

  insert into public.client_memberships (client_id, profile_id, roles, added_by)
  values (p_client_id, v_profile_id, p_roles, auth.uid())
  on conflict (client_id, profile_id) do update
    -- Re-adding someone whose membership was ended starts from the requested
    -- roles only, so an LMS Administrator can't revive old non-learner roles.
    set roles = case
          when client_memberships.is_active
            then (select array_agg(distinct r) from unnest(client_memberships.roles || excluded.roles) r)
          else excluded.roles
        end,
        is_active = true
  returning * into v_membership;

  perform public.record_audit('client_membership.add', p_client_id, 'profile', v_profile_id::text,
                              jsonb_build_object('roles', v_membership.roles));
  return v_membership;
end;
$$;

-- Replace a member's roles (empty array deactivates the membership; history is kept).
create or replace function public.set_client_roles(p_client_id uuid, p_profile_id uuid, p_roles text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old text[];
begin
  select roles into v_old from public.client_memberships
  where client_id = p_client_id and profile_id = p_profile_id;
  if v_old is null then
    raise exception 'Not a member of this client';
  end if;

  if not public.has_client_role(p_client_id, 'client_training_admin') then
    -- LMS Administrators may only add or remove the learner role.
    if not (public.has_client_role(p_client_id, 'lms_admin')
            and array(select unnest(v_old) except select 'learner' order by 1)
              = array(select unnest(coalesce(p_roles, '{}')) except select 'learner' order by 1)) then
      raise exception 'You cannot change these roles' using errcode = '42501';
    end if;
  end if;
  if p_profile_id = auth.uid() and 'client_training_admin' = any(v_old)
     and not 'client_training_admin' = any(coalesce(p_roles, '{}')) then
    raise exception 'You cannot remove your own Client Training Administrator role';
  end if;

  if cardinality(coalesce(p_roles, '{}')) = 0 then
    update public.client_memberships set is_active = false
    where client_id = p_client_id and profile_id = p_profile_id;
  else
    update public.client_memberships set roles = p_roles, is_active = true
    where client_id = p_client_id and profile_id = p_profile_id;
  end if;

  perform public.record_audit('client_membership.set_roles', p_client_id, 'profile', p_profile_id::text,
                              jsonb_build_object('from', v_old, 'to', coalesce(p_roles, '{}')));
end;
$$;

-- Move a client out of setup once the wizard's required fields are filled in.
create or replace function public.activate_client(p_client_id uuid)
returns public.clients
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client public.clients;
  v_missing text[] := '{}';
begin
  if not public.has_client_role(p_client_id, 'client_training_admin') then
    raise exception 'Only a Client Training Administrator can activate this client' using errcode = '42501';
  end if;

  select * into v_client from public.clients where id = p_client_id;
  if v_client.industry is null then v_missing := array_append(v_missing, 'industry'); end if;
  if v_client.govcon_status is null then v_missing := array_append(v_missing, 'govcon_status'); end if;
  if v_client.sap_landscape = '{}' then v_missing := array_append(v_missing, 'sap_landscape'); end if;
  if v_client.support_contact is null then v_missing := array_append(v_missing, 'support_contact'); end if;
  if not exists (select 1 from public.client_workstreams where client_id = p_client_id) then
    v_missing := array_append(v_missing, 'workstreams');
  end if;
  if cardinality(v_missing) > 0 then
    raise exception 'Client setup is incomplete: %', array_to_string(v_missing, ', ');
  end if;

  update public.clients set status = 'active' where id = p_client_id returning * into v_client;
  return v_client;
end;
$$;

revoke execute on function public.ensure_profile(text, text, boolean) from public, authenticated;
grant execute on function public.ensure_profile(text, text, boolean) to service_role;
revoke execute on function public.record_audit(text, uuid, text, text, jsonb) from public, authenticated;
grant execute on function
  public.set_platform_role(uuid, text, boolean),
  public.create_client(text, text),
  public.add_client_member(uuid, text, text, text[]),
  public.set_client_roles(uuid, uuid, text[]),
  public.activate_client(uuid),
  public.is_platform_admin(),
  public.is_global_knowledge_admin(),
  public.client_roles(uuid)
  to authenticated;

-- ============================================================================
-- The first Platform Administrators, so someone can grant everything else.
-- ============================================================================
insert into auth.users (email) values
  ('reuler@revtech.consulting'),
  ('kbehringer@revtech.consulting')
on conflict (email) do nothing;

insert into public.profiles (id, email, full_name)
select id, email, email from auth.users
where email in ('reuler@revtech.consulting', 'kbehringer@revtech.consulting')
on conflict (id) do nothing;

insert into public.platform_role_grants (profile_id, role)
select id, 'platform_admin' from public.profiles
where email in ('reuler@revtech.consulting', 'kbehringer@revtech.consulting')
on conflict do nothing;
