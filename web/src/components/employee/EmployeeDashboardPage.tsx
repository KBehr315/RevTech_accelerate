import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, Circle, Clock } from 'lucide-react'
import { useMyAssignmentStatus } from '@/hooks/useAssignments'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDate, formatScore } from '@/lib/utils'
import type { AssignmentStatus } from '@/types/domain'

function statusBadge(row: AssignmentStatus) {
  if (row.is_overdue) return <Badge variant="danger">Overdue</Badge>
  if (row.last_passed) return <Badge variant="success">Completed</Badge>
  if (row.last_attempt_id) return <Badge variant="warning">In progress</Badge>
  return <Badge variant="neutral">Not started</Badge>
}

export function EmployeeDashboardPage() {
  const { data, isLoading } = useMyAssignmentStatus()

  const { pending, completed } = useMemo(() => {
    const rows = data ?? []
    return {
      pending: rows.filter((r) => !r.last_passed || r.is_overdue),
      completed: rows.filter((r) => r.last_passed && !r.is_overdue),
    }
  }, [data])

  const overdueCount = pending.filter((r) => r.is_overdue).length

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold text-slate-900">My Training</h1>
        <p className="text-sm text-slate-500">Your assigned trainings, completion history, and renewal dates.</p>
      </div>

      {overdueCount > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-status-red-bg bg-status-red-bg px-4 py-3 text-sm text-status-red">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          You have {overdueCount} {overdueCount === 1 ? 'training' : 'trainings'} overdue. Please complete{' '}
          {overdueCount === 1 ? 'it' : 'them'} as soon as possible.
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Assigned Trainings</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {isLoading && (
            <>
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </>
          )}
          {!isLoading && pending.length === 0 && (
            <p className="py-6 text-center text-sm text-slate-400">
              Nothing pending — you're all caught up.
            </p>
          )}
          {pending.map((row) => (
            <div
              key={row.assignment_id}
              className="flex items-center justify-between rounded-lg border border-border p-4"
            >
              <div className="flex items-center gap-3">
                {row.is_overdue ? (
                  <AlertTriangle className="h-5 w-5 text-status-red" />
                ) : row.last_attempt_id ? (
                  <Clock className="h-5 w-5 text-status-yellow" />
                ) : (
                  <Circle className="h-5 w-5 text-slate-300" />
                )}
                <div>
                  <p className="font-medium text-slate-900">{row.module_title}</p>
                  <p className="text-xs text-slate-500">
                    {row.due_at ? `Due ${formatDate(row.due_at)}` : 'No due date'}
                    {row.renewal_due_at && ` · Renews ${formatDate(row.renewal_due_at)}`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {statusBadge(row)}
                <Button asChild size="sm">
                  <Link to={`/training/${row.assignment_id}`}>
                    {row.last_attempt_id && !row.last_passed ? 'Resume' : 'Start'}
                  </Link>
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Completed Trainings</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {!isLoading && completed.length === 0 && (
            <p className="py-6 text-center text-sm text-slate-400">No completed trainings yet.</p>
          )}
          {completed.map((row) => (
            <div
              key={row.assignment_id}
              className="flex items-center justify-between rounded-lg border border-border p-4"
            >
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-status-green" />
                <div>
                  <p className="font-medium text-slate-900">{row.module_title}</p>
                  <p className="text-xs text-slate-500">
                    Completed {formatDate(row.last_completed_at)}
                    {row.renewal_due_at && ` · Renew by ${formatDate(row.renewal_due_at)}`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant="success">Score: {formatScore(row.last_score_pct)}</Badge>
                <Button asChild size="sm" variant="outline">
                  <Link to={`/training/${row.assignment_id}`}>Review</Link>
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
