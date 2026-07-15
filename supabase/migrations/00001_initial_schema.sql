-- Compliance LMS: core schema
-- Tables: profiles, modules, quiz_questions, assignments, attempts
-- Plus: shared updated_at trigger, auto-profile-on-signup trigger, assignment_status view

create extension if not exists "pgcrypto";

-- ============================================================================
-- profiles: 1:1 with auth.users, adds role + display info
-- ============================================================================
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  full_name   text not null,
  role        text not null default 'employee' check (role in ('admin', 'employee')),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.profiles is 'App-level user record. One row per auth.users row, auto-created on signup via handle_new_user().';

-- ============================================================================
-- modules: training content, either authored in-app or linked/embedded externally
-- ============================================================================
create table public.modules (
  id                     uuid primary key default gen_random_uuid(),
  title                  text not null,
  description            text,
  content_type           text not null check (content_type in ('in_app', 'external')),
  content_blocks         jsonb,          -- ordered array of ContentBlock objects, required when content_type = 'in_app'
  external_content_type  text check (external_content_type in ('video', 'pdf', 'url')),
  external_url           text,           -- required when content_type = 'external'
  renewal_period_months  int check (renewal_period_months is null or renewal_period_months > 0), -- null = one-time, never expires
  passing_score_pct      int not null default 80 check (passing_score_pct between 1 and 100),
  is_published           boolean not null default false,
  created_by             uuid not null references public.profiles(id),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint modules_content_shape check (
    (content_type = 'in_app' and content_blocks is not null)
    or (content_type = 'external' and external_url is not null and external_content_type is not null)
  )
);

-- ============================================================================
-- quiz_questions: one module has many questions
-- ============================================================================
create table public.quiz_questions (
  id                  uuid primary key default gen_random_uuid(),
  module_id           uuid not null references public.modules(id) on delete cascade,
  position            int not null default 0,
  question_type       text not null check (question_type in ('multiple_choice', 'true_false')),
  prompt              text not null,
  options             jsonb not null,   -- [{ "id": "a", "text": "..." }, ...]
  correct_option_ids  jsonb not null,   -- ["a"] or ["a","c"] for multi-answer
  points              int not null default 1 check (points > 0),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ============================================================================
-- assignments: module assigned to an employee. One ongoing row per pair;
-- renewal cycles reuse the same assignment (a fresh attempt each cycle).
-- ============================================================================
create table public.assignments (
  id            uuid primary key default gen_random_uuid(),
  module_id     uuid not null references public.modules(id) on delete cascade,
  employee_id   uuid not null references public.profiles(id) on delete cascade,
  assigned_by   uuid not null references public.profiles(id),
  due_at        timestamptz,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (module_id, employee_id)
);

-- ============================================================================
-- attempts: one row per quiz attempt. Written only via the security-definer
-- RPCs in 00002 (start_attempt / mark_content_viewed / submit_attempt) —
-- employees never write this table directly.
-- ============================================================================
create table public.attempts (
  id                  uuid primary key default gen_random_uuid(),
  assignment_id       uuid not null references public.assignments(id) on delete cascade,
  employee_id         uuid not null references public.profiles(id),
  started_at          timestamptz not null default now(),
  completed_at        timestamptz,
  score_pct           numeric(5, 2),
  passed              boolean,
  answers             jsonb,            -- [{ "question_id": "...", "selected_option_ids": [...] }]
  content_viewed_at   timestamptz,      -- gate for external content: set before quiz can be submitted
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index assignments_employee_id_idx on public.assignments(employee_id);
create index assignments_module_id_idx on public.assignments(module_id);
create index attempts_assignment_id_completed_idx on public.attempts(assignment_id, completed_at desc);
create index attempts_employee_id_idx on public.attempts(employee_id);
create index quiz_questions_module_id_position_idx on public.quiz_questions(module_id, position);

-- ============================================================================
-- shared updated_at trigger
-- ============================================================================
create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  tbl text;
begin
  foreach tbl in array array['profiles', 'modules', 'quiz_questions', 'assignments', 'attempts']
  loop
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.handle_updated_at()', tbl);
  end loop;
end $$;

-- ============================================================================
-- auto-create a profile row when a new auth user is created
-- (admin invites -> auth.admin.inviteUserByEmail -> this fires -> profiles row appears)
-- ============================================================================
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
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    'employee',
    true
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ============================================================================
-- assignment_status: derives renewal-due-date and overdue flag from the
-- latest completed attempt. No stored renewal column (avoids drift if the
-- module's renewal period changes later), no cron needed. security_invoker
-- means this view honors the querying user's own RLS on the underlying
-- tables (employees see only their own rows; admins see all).
-- ============================================================================
create view public.assignment_status
with (security_invoker = true) as
select
  a.id as assignment_id,
  a.module_id,
  a.employee_id,
  a.due_at,
  a.is_active,
  m.title as module_title,
  m.renewal_period_months,
  m.passing_score_pct,
  latest.attempt_id as last_attempt_id,
  latest.completed_at as last_completed_at,
  latest.score_pct as last_score_pct,
  latest.passed as last_passed,
  coalesce(attempt_counts.attempt_count, 0) as attempt_count,
  case
    when latest.passed and m.renewal_period_months is not null
      then latest.completed_at + (m.renewal_period_months || ' months')::interval
    else null
  end as renewal_due_at,
  case
    when latest.passed is not true and a.due_at is not null and a.due_at < now() then true
    when latest.passed and m.renewal_period_months is not null
      and latest.completed_at + (m.renewal_period_months || ' months')::interval < now() then true
    else false
  end as is_overdue
from public.assignments a
join public.modules m on m.id = a.module_id
left join lateral (
  select id as attempt_id, completed_at, score_pct, passed
  from public.attempts
  where assignment_id = a.id and completed_at is not null
  order by completed_at desc
  limit 1
) latest on true
left join lateral (
  select count(*) as attempt_count
  from public.attempts
  where assignment_id = a.id
) attempt_counts on true
where a.is_active;

grant select on public.assignment_status to authenticated;
