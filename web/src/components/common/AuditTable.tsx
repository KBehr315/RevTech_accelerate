import { Skeleton } from '@/components/ui/skeleton'
import { formatDateTime } from '@/lib/utils'
import type { AuditEvent } from '@/types/domain'

/** What changed, in a line: the changed fields' names, or the details' keys and values. */
function summarize(details: Record<string, unknown>): string {
  const entries = Object.entries(details).filter(([key]) => !['id', 'client_id', 'created_at', 'updated_at'].includes(key))
  return entries
    .slice(0, 4)
    .map(([key, value]) => `${key}: ${typeof value === 'object' ? JSON.stringify(value) : String(value)}`)
    .join(' · ')
}

export function AuditTable({
  events,
  isLoading,
  nameOf,
}: {
  events: AuditEvent[] | undefined
  isLoading: boolean
  nameOf: (profileId: string | null) => string
}) {
  if (isLoading) return <Skeleton className="h-40 w-full" />
  if (!events?.length) return <p className="text-sm text-slate-500">Nothing recorded yet.</p>

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-border text-xs uppercase text-slate-500">
          <tr>
            <th scope="col" className="py-2 pr-4 font-medium">When</th>
            <th scope="col" className="py-2 pr-4 font-medium">Who</th>
            <th scope="col" className="py-2 pr-4 font-medium">Action</th>
            <th scope="col" className="py-2 font-medium">Details</th>
          </tr>
        </thead>
        <tbody>
          {events.map((e) => (
            <tr key={e.id} className="border-b border-border align-top last:border-0">
              <td className="whitespace-nowrap py-2 pr-4 text-slate-500">{formatDateTime(e.at)}</td>
              <td className="whitespace-nowrap py-2 pr-4">{nameOf(e.actor_id)}</td>
              <td className="whitespace-nowrap py-2 pr-4 font-mono text-xs">{e.action}</td>
              <td className="max-w-md break-words py-2 text-xs text-slate-600">{summarize(e.details)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
