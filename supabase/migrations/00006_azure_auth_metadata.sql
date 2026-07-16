-- Compliance LMS: broaden handle_new_user() for Azure AD (Microsoft Entra ID) sign-in
--
-- Auth now goes entirely through Azure AD SSO instead of Supabase email/password.
-- Azure's OIDC claims land in raw_user_meta_data as `name` (not `full_name`, which
-- was only ever populated by our own now-removed invite-employee function). Try
-- both keys before falling back to the email address.

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
