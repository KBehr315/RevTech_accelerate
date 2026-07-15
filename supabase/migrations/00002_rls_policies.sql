-- Compliance LMS: RLS policies + scoring RPCs
--
-- Principle: no blanket "any authenticated user" policy. Every policy checks
-- either auth.uid() against an owner column, or a role lookup via is_admin().
-- Quiz answer keys and attempt scoring never touch the client directly:
-- employees read questions through quiz_questions_public (no correct_option_ids
-- column) and write attempts only through the security-definer RPCs below.

-- ============================================================================
-- is_admin(): security definer so it can read profiles regardless of the
-- caller's own profiles RLS policy (avoids recursive-policy issues).
-- ============================================================================
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and is_active = true
  );
$$;

grant execute on function public.is_admin() to authenticated;

alter table public.profiles enable row level security;
alter table public.modules enable row level security;
alter table public.quiz_questions enable row level security;
alter table public.assignments enable row level security;
alter table public.attempts enable row level security;

-- ============================================================================
-- profiles: everyone can read their own row (+ admins read all).
-- All writes are admin-only from the client; employee accounts are actually
-- provisioned via the service-role invite-employee function, which bypasses
-- RLS entirely, so these write policies only govern in-app admin actions
-- (e.g. deactivating an employee, promoting to admin).
-- ============================================================================
create policy "profiles_select_self_or_admin"
  on public.profiles for select
  using (id = auth.uid() or public.is_admin());

create policy "profiles_admin_insert"
  on public.profiles for insert
  with check (public.is_admin());

create policy "profiles_admin_update"
  on public.profiles for update
  using (public.is_admin())
  with check (public.is_admin());

create policy "profiles_admin_delete"
  on public.profiles for delete
  using (public.is_admin());

-- ============================================================================
-- modules: an employee may read a module only if it's assigned to them;
-- admins read/write everything.
-- ============================================================================
create policy "modules_select_assigned_or_admin"
  on public.modules for select
  using (
    public.is_admin()
    or exists (
      select 1 from public.assignments a
      where a.module_id = modules.id and a.employee_id = auth.uid()
    )
  );

create policy "modules_admin_insert"
  on public.modules for insert
  with check (public.is_admin());

create policy "modules_admin_update"
  on public.modules for update
  using (public.is_admin())
  with check (public.is_admin());

create policy "modules_admin_delete"
  on public.modules for delete
  using (public.is_admin());

-- ============================================================================
-- quiz_questions: admin-only, full stop. Employees never read this table
-- directly (it holds the answer key) — they read quiz_questions_public below.
-- ============================================================================
create policy "quiz_questions_admin_all"
  on public.quiz_questions for all
  using (public.is_admin())
  with check (public.is_admin());

create view public.quiz_questions_public as
select id, module_id, position, question_type, prompt, options, points
from public.quiz_questions q
where public.is_admin()
   or exists (
     select 1 from public.assignments a
     where a.module_id = q.module_id and a.employee_id = auth.uid()
   );

grant select on public.quiz_questions_public to authenticated;

-- ============================================================================
-- assignments: employees read only their own; admins read/write all.
-- ============================================================================
create policy "assignments_select_own_or_admin"
  on public.assignments for select
  using (employee_id = auth.uid() or public.is_admin());

create policy "assignments_admin_insert"
  on public.assignments for insert
  with check (public.is_admin());

create policy "assignments_admin_update"
  on public.assignments for update
  using (public.is_admin())
  with check (public.is_admin());

create policy "assignments_admin_delete"
  on public.assignments for delete
  using (public.is_admin());

-- ============================================================================
-- attempts: employees read only their own (their score history); admins
-- read all. No client write policies at all — every attempt is created and
-- scored by the RPCs below, which run as security definer and therefore
-- bypass RLS for their own inserts/updates while enforcing ownership checks
-- in-function via auth.uid().
-- ============================================================================
create policy "attempts_select_own_or_admin"
  on public.attempts for select
  using (employee_id = auth.uid() or public.is_admin());

-- ============================================================================
-- start_attempt: begin a new attempt for one of the caller's own assignments.
-- ============================================================================
create or replace function public.start_attempt(p_assignment_id uuid)
returns public.attempts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employee_id uuid := auth.uid();
  v_owned boolean;
  v_attempt public.attempts;
begin
  select exists (
    select 1 from public.assignments
    where id = p_assignment_id and employee_id = v_employee_id and is_active
  ) into v_owned;

  if not v_owned then
    raise exception 'Assignment not found or not owned by caller';
  end if;

  insert into public.attempts (assignment_id, employee_id, started_at)
  values (p_assignment_id, v_employee_id, now())
  returning * into v_attempt;

  return v_attempt;
end;
$$;

grant execute on function public.start_attempt(uuid) to authenticated;

-- ============================================================================
-- mark_content_viewed: gate for external content — sets content_viewed_at on
-- the caller's own in-progress attempt. The player disables the quiz until
-- this has been called (for external modules only).
-- ============================================================================
create or replace function public.mark_content_viewed(p_attempt_id uuid)
returns public.attempts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employee_id uuid := auth.uid();
  v_attempt public.attempts;
begin
  update public.attempts
  set content_viewed_at = now()
  where id = p_attempt_id and employee_id = v_employee_id and completed_at is null
  returning * into v_attempt;

  if v_attempt is null then
    raise exception 'Attempt not found, already completed, or not owned by caller';
  end if;

  return v_attempt;
end;
$$;

grant execute on function public.mark_content_viewed(uuid) to authenticated;

-- ============================================================================
-- submit_attempt: score the quiz server-side (the client never sees
-- correct_option_ids) and complete the caller's own in-progress attempt.
-- p_answers shape: [{ "question_id": "<uuid>", "selected_option_ids": ["a"] }]
-- ============================================================================
create or replace function public.submit_attempt(p_attempt_id uuid, p_answers jsonb)
returns public.attempts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employee_id uuid := auth.uid();
  v_module_id uuid;
  v_content_type text;
  v_content_viewed_at timestamptz;
  v_passing_score int;
  v_total_points numeric := 0;
  v_earned_points numeric := 0;
  v_question record;
  v_answer jsonb;
  v_selected jsonb;
  v_correct jsonb;
  v_score_pct numeric;
  v_passed boolean;
  v_attempt public.attempts;
begin
  select m.id, m.content_type, m.passing_score_pct, att.content_viewed_at
  into v_module_id, v_content_type, v_passing_score, v_content_viewed_at
  from public.attempts att
  join public.assignments a on a.id = att.assignment_id
  join public.modules m on m.id = a.module_id
  where att.id = p_attempt_id and att.employee_id = v_employee_id and att.completed_at is null;

  if v_module_id is null then
    raise exception 'Attempt not found, already completed, or not owned by caller';
  end if;

  if v_content_type = 'external' and v_content_viewed_at is null then
    raise exception 'Content must be marked as viewed before the quiz can be submitted';
  end if;

  for v_question in
    select id, correct_option_ids, points
    from public.quiz_questions
    where module_id = v_module_id
  loop
    v_total_points := v_total_points + v_question.points;

    select value into v_answer
    from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb)) as value
    where value ->> 'question_id' = v_question.id::text
    limit 1;

    if v_answer is not null then
      select coalesce(jsonb_agg(x order by x), '[]'::jsonb) into v_selected
      from jsonb_array_elements_text(coalesce(v_answer -> 'selected_option_ids', '[]'::jsonb)) x;

      select coalesce(jsonb_agg(x order by x), '[]'::jsonb) into v_correct
      from jsonb_array_elements_text(v_question.correct_option_ids) x;

      if v_selected = v_correct then
        v_earned_points := v_earned_points + v_question.points;
      end if;
    end if;
  end loop;

  if v_total_points = 0 then
    v_score_pct := 0;
  else
    v_score_pct := round((v_earned_points / v_total_points) * 100, 2);
  end if;

  v_passed := v_score_pct >= v_passing_score;

  update public.attempts
  set completed_at = now(),
      score_pct = v_score_pct,
      passed = v_passed,
      answers = p_answers
  where id = p_attempt_id
  returning * into v_attempt;

  return v_attempt;
end;
$$;

grant execute on function public.submit_attempt(uuid, jsonb) to authenticated;
