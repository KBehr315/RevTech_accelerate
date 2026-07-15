import { Link } from 'react-router-dom'
import { AlertTriangle, BookOpen, CheckCircle2, Users } from 'lucide-react'
import { useModules } from '@/hooks/useModules'
import { useProfiles } from '@/hooks/useProfiles'
import { useAllAssignmentStatus } from '@/hooks/useAssignments'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

function StatCard({
  icon: Icon,
  label,
  value,
  tone = 'default',
}: {
  icon: typeof BookOpen
  label: string
  value: string | number
  tone?: 'default' | 'danger'
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-5">
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-lg ${
            tone === 'danger' ? 'bg-status-red-bg text-status-red' : 'bg-brand-50 text-brand-700'
          }`}
        >
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

export function AdminOverviewPage() {
  const { data: modules, isLoading: loadingModules } = useModules()
  const { data: profiles, isLoading: loadingProfiles } = useProfiles()
  const { data: statuses, isLoading: loadingStatuses } = useAllAssignmentStatus()

  const loading = loadingModules || loadingProfiles || loadingStatuses

  const employeeCount = profiles?.filter((p) => p.role === 'employee').length ?? 0
  const overdueCount = statuses?.filter((s) => s.is_overdue).length ?? 0
  const completedCount = statuses?.filter((s) => s.last_passed && !s.is_overdue).length ?? 0

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold text-slate-900">Overview</h1>
        <p className="text-sm text-slate-500">A quick snapshot of your organization's training compliance.</p>
      </div>

      {loading ? (
        <div className="grid grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-4">
          <StatCard icon={BookOpen} label="Training Modules" value={modules?.length ?? 0} />
          <StatCard icon={Users} label="Employees" value={employeeCount} />
          <StatCard icon={CheckCircle2} label="Compliant Assignments" value={completedCount} />
          <StatCard icon={AlertTriangle} label="Overdue" value={overdueCount} tone={overdueCount > 0 ? 'danger' : 'default'} />
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Get started</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm text-slate-600">
          <p>
            1. Create a training module in{' '}
            <Link to="/admin/modules" className="text-brand-600 hover:underline">
              Modules
            </Link>
            .
          </p>
          <p>
            2. Invite your team in{' '}
            <Link to="/admin/users" className="text-brand-600 hover:underline">
              Employees
            </Link>
            .
          </p>
          <p>
            3. Assign the module to employees in{' '}
            <Link to="/admin/assignments" className="text-brand-600 hover:underline">
              Assignments
            </Link>
            .
          </p>
          <p>
            4. Track completion in{' '}
            <Link to="/admin/reports" className="text-brand-600 hover:underline">
              Compliance Reports
            </Link>
            .
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
