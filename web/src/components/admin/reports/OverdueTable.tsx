import { formatDate } from '@/lib/utils'
import type { AssignmentStatus } from '@/types/domain'

export function OverdueTable({ rows, nameById }: { rows: AssignmentStatus[]; nameById: Map<string, string> }) {
  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-slate-400">Nobody is overdue. Nice work.</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border text-xs uppercase tracking-wide text-slate-400">
            <th className="py-2 pr-4 font-medium">Employee</th>
            <th className="py-2 pr-4 font-medium">Module</th>
            <th className="py-2 pr-4 font-medium">Due / Renewal</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.assignment_id} className="border-b border-border last:border-b-0">
              <td className="py-2 pr-4 text-slate-800">{nameById.get(row.employee_id) ?? 'Unknown'}</td>
              <td className="py-2 pr-4 text-slate-800">{row.module_title}</td>
              <td className="py-2 pr-4 text-status-red">{formatDate(row.renewal_due_at ?? row.due_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
