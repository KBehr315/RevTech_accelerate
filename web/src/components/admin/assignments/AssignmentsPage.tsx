import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useAllAssignmentStatus, useDeactivateAssignment } from '@/hooks/useAssignments'
import { useProfiles } from '@/hooks/useProfiles'
import { formatDate, formatScore } from '@/lib/utils'
import { AssignModuleDialog } from './AssignModuleDialog'
import type { AssignmentStatus } from '@/types/domain'

function statusBadge(row: AssignmentStatus) {
  if (row.is_overdue) return <Badge variant="danger">Overdue</Badge>
  if (row.last_passed) return <Badge variant="success">Completed</Badge>
  if (row.last_attempt_id) return <Badge variant="warning">In progress</Badge>
  return <Badge variant="neutral">Not started</Badge>
}

export function AssignmentsPage() {
  const { data: statuses, isLoading } = useAllAssignmentStatus()
  const { data: profiles } = useProfiles()
  const deactivate = useDeactivateAssignment()

  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name]))

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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-semibold text-slate-900">Assignments</h1>
          <p className="text-sm text-slate-500">Assign training modules to employees and track who's assigned what.</p>
        </div>
        <AssignModuleDialog />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Assignments</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {isLoading && <Skeleton className="h-40 w-full" />}
          {!isLoading && statuses?.length === 0 && (
            <p className="py-8 text-center text-sm text-slate-400">No assignments yet.</p>
          )}
          {statuses?.map((row) => (
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
