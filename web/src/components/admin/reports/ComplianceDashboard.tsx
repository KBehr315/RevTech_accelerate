import { AlertTriangle, CheckCircle2, Circle, Clock } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { OverdueTable } from './OverdueTable'
import type { AssignmentStatus, Profile } from '@/types/domain'

function Tile({
  icon: Icon,
  label,
  value,
  tone = 'default',
}: {
  icon: typeof Circle
  label: string
  value: number
  tone?: 'default' | 'success' | 'warning' | 'danger'
}) {
  const toneClasses = {
    default: 'bg-brand-50 text-brand-700',
    success: 'bg-status-green-bg text-status-green',
    warning: 'bg-status-yellow-bg text-status-yellow',
    danger: 'bg-status-red-bg text-status-red',
  }[tone]

  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-5">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${toneClasses}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-2xl font-semibold text-slate-900">{value}</p>
          <p className="text-xs text-slate-500">{label}</p>
        </div>
      </CardContent>
    </Card>
  )
}

export function ComplianceDashboard({ statuses, profiles }: { statuses: AssignmentStatus[]; profiles: Profile[] }) {
  const nameById = new Map(profiles.map((p) => [p.id, p.full_name]))

  const overdue = statuses.filter((s) => s.is_overdue)
  const completed = statuses.filter((s) => s.last_passed && !s.is_overdue)
  const inProgress = statuses.filter((s) => !s.is_overdue && s.last_attempt_id && !s.last_passed)
  const notStarted = statuses.filter((s) => !s.is_overdue && !s.last_attempt_id)

  const complianceRate = statuses.length > 0 ? Math.round((completed.length / statuses.length) * 100) : 0

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-4 gap-4">
        <Tile icon={CheckCircle2} label={`${complianceRate}% Compliant`} value={completed.length} tone="success" />
        <Tile icon={Clock} label="In Progress" value={inProgress.length} tone="warning" />
        <Tile icon={Circle} label="Not Started" value={notStarted.length} />
        <Tile icon={AlertTriangle} label="Overdue" value={overdue.length} tone={overdue.length > 0 ? 'danger' : 'default'} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Overdue Employees</CardTitle>
        </CardHeader>
        <CardContent>
          <OverdueTable rows={overdue} nameById={nameById} />
        </CardContent>
      </Card>
    </div>
  )
}
