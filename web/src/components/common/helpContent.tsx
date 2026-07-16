import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

export interface HelpEntry {
  title: string
  body: ReactNode
}

const linkClass = 'text-brand-600 hover:underline'

export const HELP_CONTENT = {
  'employee-dashboard': {
    title: 'My Training',
    body: (
      <>
        <p>This page shows every training module assigned to you.</p>
        <p>
          <strong>Assigned Trainings</strong> lists what's due or in progress, soonest due date first.{' '}
          <strong>Completed Trainings</strong> shows your score history and when each one needs to be renewed.
        </p>
        <p>Click Start (or Resume) to open a module and take its quiz.</p>
      </>
    ),
  },
  'training-player': {
    title: 'Taking a Training',
    body: (
      <>
        <p>Review the content above, then continue to the quiz.</p>
        <p>
          For linked or embedded content, you must click "I've reviewed this" before the quiz unlocks — that's what
          marks the content as viewed.
        </p>
        <p>You need to meet the module's passing score to complete it. If you don't pass, you can retake it right away.</p>
      </>
    ),
  },
  'admin-dashboard': {
    title: 'Dashboard',
    body: (
      <>
        <p>
          A snapshot of training compliance across the organization: how many modules and employees you have, and
          how everyone's assigned training is progressing. The Overdue Employees table lists anyone past their due
          date or renewal date.
        </p>
        <p className="font-medium text-slate-700">Getting started:</p>
        <ol className="list-decimal space-y-1 pl-4">
          <li>
            Create a training module in{' '}
            <Link to="/admin/modules" className={linkClass}>
              Modules
            </Link>
            .
          </li>
          <li>
            Invite your team in{' '}
            <Link to="/admin/users" className={linkClass}>
              Employees
            </Link>
            .
          </li>
          <li>
            Assign the module to employees in{' '}
            <Link to="/admin/assignments" className={linkClass}>
              Assignments
            </Link>
            .
          </li>
          <li>Track completion right here on the Dashboard as training gets underway.</li>
        </ol>
      </>
    ),
  },
  'admin-modules': {
    title: 'Training Modules',
    body: (
      <>
        <p>
          Create training content here, either authored directly in-app (headings, text, images, video embeds) or
          linked to an external video/PDF/URL, then attach a quiz.
        </p>
        <p>
          A module saves as a <strong>draft</strong> with just a title — content is only required once you check
          "Published." Drafts are never visible to employees, even if one somehow gets assigned before it's finished.
        </p>
        <p>
          Tag modules with topics on the Edit Module page, then use the search box here (or on Assignments) to find
          modules by title or topic.
        </p>
      </>
    ),
  },
  'admin-module-edit': {
    title: 'Edit Module',
    body: (
      <>
        <p>
          Fill in the module's content on the Content tab and save. Once it's saved, the Quiz tab unlocks — add at
          least one question there before assigning it to anyone.
        </p>
        <p>
          Check "Published" once the module is ready for employees to see. Publishing is disabled until there's
          real content (a content block, or an external URL) to show.
        </p>
      </>
    ),
  },
  'admin-assignments': {
    title: 'Assignments',
    body: (
      <>
        <p>
          Assign a published module to one or more employees, with an optional due date. Use "Add everyone from a
          group" to quickly pull in a whole employee group, then fine-tune individuals before assigning. Search the
          module list by title or topic if you're assigning from a large catalog.
        </p>
        <p>
          Sort the list below by employee, module, or status — sorting by status puts overdue assignments first.
          Search it by employee name, module title, or topic.
        </p>
      </>
    ),
  },
  'admin-users': {
    title: 'Employees',
    body: (
      <>
        <p>
          Employees appear here automatically the first time they sign in with Microsoft — there's no invite step.
          Promote or demote admins here; deactivating someone marks them inactive and preserves their training
          history, but doesn't revoke their Microsoft account access on its own — remove them from the Azure AD
          tenant/group for that.
        </p>
        <p>
          Use Employee Groups to organize people (e.g. by team) so you can batch-assign training to everyone in a
          group at once from the Assignments page.
        </p>
      </>
    ),
  },
} satisfies Record<string, HelpEntry>

export type HelpKey = keyof typeof HELP_CONTENT
