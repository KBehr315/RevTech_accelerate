import { useState } from 'react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAllAssignmentStatus, useDeactivateAssignment } from '@/hooks/useAssignments'
import { useProfiles } from '@/hooks/useProfiles'
import { formatDate, formatScore } from '@/lib/utils'
import { PageHelp } from '@/components/common/PageHelp'
import { AssignModulePanel } from './AssignModulePanel'
import type { AssignmentStatus } from '@/types/domain'

function statusBadge(row: AssignmentStatus) {
  if (row.is_overdue) return <Badge variant="danger">Overdue</Badge>
  if (row.last_passed) return <Badge variant="success">Completed</Badge>
  if (row.last_attempt_id) return <Badge variant="warning">In progress</Badge>
  return <Badge variant="neutral">Not started</Badge>
}

// Overdue first (most urgent), then in-progress, not-started, completed last.
function statusRank(row: AssignmentStatus): number {
  if (row.is_overdue) return 0
  if (row.last_passed) return 3
  if (row.last_attempt_id) return 1
  return 2
}

type SortKey = 'employee' | 'module' | 'status'

export function AssignmentsPage() {
  const { data: statuses, isLoading } = useAllAssignmentStatus()
  const { data: profiles } = useProfiles()
  const deactivate = useDeactivateAssignment()
  const [sortBy, setSortBy] = useState<SortKey>('employee')

  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name]))

  const sortedStatuses = [...(statuses ?? [])].sort((a, b) => {
    if (sortBy === 'employee') {
      return (nameById.get(a.employee_id) ?? '').localeCompare(nameById.get(b.employee_id) ?? '')
    }
    if (sortBy === 'module') {
      return a.module_title.localeCompare(b.module_title)
    }
    return statusRank(a) - statusRank(b)
  })

  async function handleRemove(id: string) {
    if (!confirm('Remove this assignment? The employee will no longer see it.')) return
    try {
      await deactivate.mutateAsync(id)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not remove assignment')
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-heading text-2xl font-semibold text-slate-900">Assignments</h1>
          <p className="text-sm text-slate-500">Assign training modules to employees and track who's assigned what.</p>
        </div>
        <PageHelp helpKey="admin-assignments" />
      </div>

      <AssignModulePanel />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>All Assignments</CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-500">Sort by</span>
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortKey)}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="employee">Employee</SelectItem>
                <SelectItem value="module">Module</SelectItem>
                <SelectItem value="status">Status</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {isLoading && <Skeleton className="h-40 w-full" />}
          {!isLoading && sortedStatuses.length === 0 && (
            <p className="py-8 text-center text-sm text-slate-400">No assignments yet.</p>
          )}
          {sortedStatuses.map((row) => (
            <div key={row.assignment_id} className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium text-slate-900">{row.module_title}</p>
                <p className="text-xs text-slate-500">
                  {nameById.get(row.employee_id) ?? 'Unknown employee'}
                  {row.due_at && ` · Due ${formatDate(row.due_at)}`}
                  {row.renewal_due_at && ` · Renews ${formatDate(row.renewal_due_at)}`}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {row.last_score_pct !== null && <span className="text-xs text-slate-500">Score: {formatScore(row.last_score_pct)}</span>}
                {statusBadge(row)}
                <Button variant="ghost" size="sm" onClick={() => handleRemove(row.assignment_id)}>
                  Remove
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
