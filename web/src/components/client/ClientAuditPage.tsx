import { Card, CardContent } from '@/components/ui/card'
import { AuditTable } from '@/components/common/AuditTable'
import { PageHeader } from '@/components/common/PageHeader'
import { useClientAudit, useMembers } from '@/hooks/useClient'
import { useWorkspace } from './workspace'

export function ClientAuditPage() {
  const { client } = useWorkspace()
  const { data: events, isLoading } = useClientAudit(client.id)
  const { data: members } = useMembers(client.id)
  const names = new Map(members?.map((m) => [m.profile_id, m.profiles?.full_name ?? '']))

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Audit log" helpKey="client-audit" />
      <Card>
        <CardContent className="p-4">
          <AuditTable
            events={events}
            isLoading={isLoading}
            // Actors outside the client (a Platform Administrator, say) aren't visible to its members.
            nameOf={(id) => (id ? names.get(id) || 'Someone outside this client' : 'System')}
          />
        </CardContent>
      </Card>
    </div>
  )
}
