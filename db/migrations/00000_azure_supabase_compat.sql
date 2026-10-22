-- Compliance LMS: the Supabase built-ins the later migrations depend on
--
-- The app moved from Supabase to Azure Database for PostgreSQL + PostgREST.
-- Migrations 00001-00005 were written against Supabase, which provides an
-- auth.users table, an auth.uid() function, and the `authenticated` role out of
-- the box. Recreating those three things here lets every later migration (and
-- every RLS policy and scoring RPC in them) run unchanged.
--
-- How identity reaches auth.uid(): the API server (server/auth.js) verifies the
-- caller's Microsoft ID token, looks up their profile id, and forwards the
-- request to PostgREST with a short-lived JWT it signs itself
-- ({ role: 'authenticated', sub: <profile id> }). PostgREST switches to that role
-- and exposes the claims as request.jwt.claims, the same as Supabase did.
--
-- The PostgREST login role (accelerate_authenticator) holds a password, so it is
-- created by server/migrate.js from a secret rather than here.

create schema if not exists auth;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  -- Used only by the API server, to call public.ensure_profile() (00006).
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin;
  end if;
end
$$;

-- Supabase keeps login credentials here; this app only needs the id and email,
-- plus the display name from the Microsoft token. Inserting a row fires
-- handle_new_user() (00001), which creates the matching profile.
create table if not exists auth.users (
  id                  uuid primary key default gen_random_uuid(),
  email               text unique not null,
  raw_user_meta_data  jsonb not null default '{}',
  created_at          timestamptz not null default now()
);

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid
$$;

grant usage on schema auth to authenticated, service_role;
grant execute on function auth.uid() to authenticated, service_role;
grant usage on schema public to authenticated, service_role;

-- Supabase grants table access to `authenticated` by default and relies on RLS
-- to narrow it; every table in 00001-00004 enables RLS, so do the same.
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant usage, select on sequences to authenticated;

-- This database shares a server with RevelationHub. Only roles granted CONNECT
-- explicitly (server/migrate.js grants it to accelerate_authenticator) may connect.
do $$
begin
  execute format('revoke connect on database %I from public', current_database());
end
$$;
