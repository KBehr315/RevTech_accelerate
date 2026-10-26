-- Compliance LMS: profiles for Microsoft Entra ID sign-in
--
-- Employees sign in with their RevTech Microsoft account; there is no invite
-- step. The first time someone signs in, the API server calls ensure_profile(),
-- which inserts an auth.users row and lets handle_new_user() create the
-- employee profile. Admins then promote people from the Employees page.

-- Microsoft puts the display name in the `name` claim, not `full_name`.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role, is_active)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      new.email
    ),
    'employee',
    true
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Returns the caller's profile, creating it on first sign-in. Also fills in the
-- display name for profiles seeded below, which start out named after the email.
-- Callable only by service_role: the email comes from a token the API server has
-- already verified, and nothing a browser sends reaches this function.
create or replace function public.ensure_profile(p_email text, p_name text)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(p_email));
  v_profile public.profiles;
begin
  insert into auth.users (email, raw_user_meta_data)
  values (v_email, jsonb_build_object('name', nullif(trim(p_name), '')))
  on conflict (email) do nothing;

  update public.profiles
  set full_name = trim(p_name)
  where lower(email) = v_email and full_name = email and nullif(trim(p_name), '') is not null;

  select * into v_profile from public.profiles where lower(email) = v_email;
  return v_profile;
end;
$$;

revoke execute on function public.ensure_profile(text, text) from public, authenticated;
grant execute on function public.ensure_profile(text, text) to service_role;

-- The default privileges in 00000 (like Supabase's) also granted writes on the
-- two views. quiz_questions_public is a simple view, so Postgres would let an
-- employee insert or edit questions through it, and the view runs as its owner,
-- which skips the admin-only policy on quiz_questions. Both views are read-only.
revoke insert, update, delete on public.quiz_questions_public, public.assignment_status from authenticated;

-- The first admins, so someone can promote everyone else.
insert into auth.users (email) values
  ('reuler@revtech.consulting'),
  ('kbehringer@revtech.consulting')
on conflict (email) do nothing;

update public.profiles
set role = 'admin'
where email in ('reuler@revtech.consulting', 'kbehringer@revtech.consulting');
