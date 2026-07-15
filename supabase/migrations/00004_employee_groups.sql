-- Compliance LMS: employee groups, for batch-assigning training
--
-- Groups are an admin-side convenience for building an assignment list
-- quickly (e.g. "Engineering", "New Hires") — they don't create any
-- ongoing link to the assignments they help create. Picking a group in the
-- assignment UI just adds its current members to the employee picker;
-- membership changes afterward don't retroactively affect past assignments.
-- Admin-only end to end — employees never need to read these tables.

create table public.employee_groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  created_by  uuid not null references public.profiles(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.employee_group_members (
  group_id    uuid not null references public.employee_groups(id) on delete cascade,
  employee_id uuid not null references public.profiles(id) on delete cascade,
  added_at    timestamptz not null default now(),
  primary key (group_id, employee_id)
);

create index employee_group_members_employee_id_idx on public.employee_group_members(employee_id);

create trigger set_updated_at
  before update on public.employee_groups
  for each row execute function public.handle_updated_at();

alter table public.employee_groups enable row level security;
alter table public.employee_group_members enable row level security;

create policy "employee_groups_admin_all"
  on public.employee_groups for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "employee_group_members_admin_all"
  on public.employee_group_members for all
  using (public.is_admin())
  with check (public.is_admin());
