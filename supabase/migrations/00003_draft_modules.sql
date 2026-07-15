-- Compliance LMS: let modules be saved as incomplete drafts
--
-- Previously modules_content_shape required real content (blocks or an
-- external URL) on every save, so an admin couldn't jot down a title and
-- finish later. Content is now only required once a module is actually
-- published — is_published = false (the default) accepts an empty in-app
-- block list or an unset external link.
--
-- To keep "draft" meaningful (not just a cosmetic badge), the modules RLS
-- select policy and quiz_questions_public view are tightened to match:
-- employees only ever see a module that is BOTH assigned to them AND
-- published, so a draft can never leak to an employee even if it's
-- accidentally assigned before it's finished.

alter table public.modules drop constraint modules_content_shape;

alter table public.modules add constraint modules_content_shape check (
  not is_published
  or (
    (content_type = 'in_app' and content_blocks is not null and jsonb_array_length(content_blocks) > 0)
    or (content_type = 'external' and external_url is not null and external_url <> '' and external_content_type is not null)
  )
);

drop policy if exists "modules_select_assigned_or_admin" on public.modules;

create policy "modules_select_assigned_or_admin"
  on public.modules for select
  using (
    public.is_admin()
    or (
      modules.is_published
      and exists (
        select 1 from public.assignments a
        where a.module_id = modules.id and a.employee_id = auth.uid()
      )
    )
  );

create or replace view public.quiz_questions_public as
select id, module_id, position, question_type, prompt, options, points
from public.quiz_questions q
where public.is_admin()
   or exists (
     select 1
     from public.assignments a
     join public.modules m on m.id = a.module_id
     where a.module_id = q.module_id
       and a.employee_id = auth.uid()
       and m.is_published
   );
