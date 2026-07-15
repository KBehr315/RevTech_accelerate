import { useAllAssignmentStatus } from '@/hooks/useAssignments'
import { useProfiles } from '@/hooks/useProfiles'
import { Skeleton } from '@/components/ui/skeleton'
import { ComplianceDashboard } from './ComplianceDashboard'

export function ReportsPage() {
  const { data: statuses, isLoading: loadingStatuses } = useAllAssignmentStatus()
  const { data: profiles, isLoading: loadingProfiles } = useProfiles()

  const loading = loadingStatuses || loadingProfiles

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold text-slate-900">Compliance Reports</h1>
        <p className="text-sm text-slate-500">Completion status across all assigned training.</p>
      </div>

      {loading ? <Skeleton className="h-96 w-full" /> : <ComplianceDashboard statuses={statuses ?? []} profiles={profiles ?? []} />}
    </div>
  )
}
