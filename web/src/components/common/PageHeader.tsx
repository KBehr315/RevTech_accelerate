import type { ReactNode } from 'react'
import { PageHelp } from './PageHelp'
import type { HelpKey } from './helpContent'

export function PageHeader({
  title,
  description,
  helpKey,
  actions,
}: {
  title: string
  description?: ReactNode
  helpKey?: HelpKey
  actions?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="font-heading text-2xl font-semibold text-slate-900">{title}</h1>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
      <div className="flex items-center gap-2">
        {actions}
        {helpKey && <PageHelp helpKey={helpKey} />}
      </div>
    </div>
  )
}

export function ErrorText({ error }: { error: unknown }) {
  if (!error) return null
  return (
    <p role="alert" className="text-sm text-status-red">
      {error instanceof Error ? error.message : 'Something went wrong.'}
    </p>
  )
}
