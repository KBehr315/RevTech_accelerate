import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useProfiles, useSetProfileActive, useSetProfileRole } from '@/hooks/useProfiles'
import { useAuthStore } from '@/store/authStore'
import { PageHelp } from '@/components/common/PageHelp'
import { GroupsPanel } from './GroupsPanel'

export function UsersPage() {
  const { data: profiles, isLoading } = useProfiles()
  const setActive = useSetProfileActive()
  const setRole = useSetProfileRole()
  const currentProfile = useAuthStore((s) => s.profile)

  async function handleToggleActive(id: string, isActive: boolean) {
    try {
      await setActive.mutateAsync({ id, isActive: !isActive })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update employee')
    }
  }

  async function handleToggleRole(id: string, role: 'admin' | 'employee') {
    try {
      await setRole.mutateAsync({ id, role: role === 'admin' ? 'employee' : 'admin' })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update role')
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-semibold text-slate-900">Employees</h1>
          <p className="text-sm text-slate-500">
            Employees appear here the first time they sign in with Microsoft. Manage admin access below.
          </p>
        </div>
        <PageHelp helpKey="admin-users" />
      </div>

      <GroupsPanel />

      <Card>
        <CardHeader>
          <CardTitle>Roster</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {isLoading && <Skeleton className="h-40 w-full" />}
          {profiles?.map((p) => (
            <div key={p.id} className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-slate-900">{p.full_name}</p>
                  <Badge variant={p.role === 'admin' ? 'default' : 'neutral'}>{p.role}</Badge>
                  {!p.is_active && <Badge variant="danger">Deactivated</Badge>}
                </div>
                <p className="text-xs text-slate-500">{p.email}</p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleToggleRole(p.id, p.role)}
                  disabled={p.id === currentProfile?.id}
                >
                  {p.role === 'admin' ? 'Make employee' : 'Make admin'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleToggleActive(p.id, p.is_active)}
                  disabled={p.id === currentProfile?.id}
                >
                  {p.is_active ? 'Deactivate' : 'Reactivate'}
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
