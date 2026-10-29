import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PageHeader } from '@/components/common/PageHeader'
import { useAllClients } from '@/hooks/usePlatform'
import { db, unwrap } from '@/lib/db'
import { CLIENT_ROLE_DESCRIPTIONS, CLIENT_ROLE_LABELS } from '@/lib/labels'
import { usePreviewStore } from '@/store/previewStore'
import type { ClientRole } from '@/types/domain'

// The roles that can be previewed so far; the database accepts any client role.
const PREVIEW_ROLES: ClientRole[] = ['learner']

/** Platform Administrators: see the platform exactly as one role in one client sees it (00110). */
export function ViewAsPage() {
  const { data: clients } = useAllClients()
  const [clientId, setClientId] = useState('')
  const [role, setRole] = useState<ClientRole>(PREVIEW_ROLES[0])
  const [busy, setBusy] = useState(false)
  const start = usePreviewStore((s) => s.start)
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const client = clients?.find((c) => c.id === clientId)

  async function begin() {
    if (!client) return
    setBusy(true)
    try {
      unwrap(await db.rpc('start_preview', { p_client_id: client.id, p_role: role }))
      start({ client: { id: client.id, name: client.name, slug: client.slug }, role })
      // Nothing loaded as yourself should show during the preview.
      queryClient.removeQueries()
      navigate('/')
    } catch (err) {
      toast.error((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="View as…"
        description="See the platform exactly as a role in a client sees it: the same menus, pages and data. The preview is read-only, and each one is recorded in the audit log."
      />
      <Card>
        <CardContent className="flex flex-col gap-4 p-6 sm:max-w-md">
          <div className="flex flex-col gap-1">
            <Label htmlFor="view-as-client">Client</Label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger id="view-as-client">
                <SelectValue placeholder="Choose a client" />
              </SelectTrigger>
              <SelectContent>
                {clients
                  ?.filter((c) => c.status !== 'archived')
                  .map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="view-as-role">Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as ClientRole)}>
              <SelectTrigger id="view-as-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PREVIEW_ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {CLIENT_ROLE_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-slate-500">{CLIENT_ROLE_DESCRIPTIONS[role]}</p>
          </div>
          <Button className="self-start" disabled={!client || busy} onClick={() => void begin()}>
            <Eye className="h-4 w-4" aria-hidden />
            {busy ? 'Starting…' : 'Start preview'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
