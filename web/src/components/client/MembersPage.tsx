import { useState } from 'react'
import { toast } from 'sonner'
import { UserPlus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input, Label } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorText, PageHeader } from '@/components/common/PageHeader'
import { useAddMember, useMembers, useSetMemberRoles, type MemberRow } from '@/hooks/useClient'
import { CLIENT_ROLES, CLIENT_ROLE_DESCRIPTIONS, CLIENT_ROLE_LABELS } from '@/lib/labels'
import { useAuthStore } from '@/store/authStore'
import type { ClientRole } from '@/types/domain'
import { useWorkspace } from './workspace'

function RolePicker({
  value,
  onChange,
  allowed,
  idPrefix,
}: {
  value: ClientRole[]
  onChange: (roles: ClientRole[]) => void
  allowed: ClientRole[]
  idPrefix: string
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium text-slate-700">Roles</legend>
      {CLIENT_ROLES.map((role) => {
        const id = `${idPrefix}-${role}`
        return (
          <label key={role} htmlFor={id} className="flex items-start gap-2 text-sm">
            <Checkbox
              id={id}
              className="mt-0.5"
              checked={value.includes(role)}
              disabled={!allowed.includes(role)}
              onCheckedChange={(on) => onChange(on === true ? [...value, role] : value.filter((r) => r !== role))}
            />
            <span>
              <span className="font-medium text-slate-900">{CLIENT_ROLE_LABELS[role]}</span>
              <span className="block text-xs text-slate-500">{CLIENT_ROLE_DESCRIPTIONS[role]}</span>
            </span>
          </label>
        )
      })}
    </fieldset>
  )
}

export function MembersPage() {
  const { client, roles: myRoles } = useWorkspace()
  const me = useAuthStore((s) => s.profile)
  const { data: members, isLoading } = useMembers(client.id)
  const add = useAddMember(client.id)
  const setRoles = useSetMemberRoles(client.id)
  const isCta = myRoles.includes('client_training_admin')
  const allowed: ClientRole[] = isCta ? CLIENT_ROLES : ['learner']

  const [adding, setAdding] = useState(false)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [newRoles, setNewRoles] = useState<ClientRole[]>(['learner'])
  const [editing, setEditing] = useState<MemberRow | null>(null)
  const [editRoles, setEditRoles] = useState<ClientRole[]>([])

  function closeAdd() {
    setAdding(false)
    setEmail('')
    setName('')
    setNewRoles(['learner'])
    add.reset()
  }

  async function submitAdd(e: React.FormEvent) {
    e.preventDefault()
    await add.mutateAsync({ email: email.trim(), name: name.trim(), roles: newRoles })
    toast.success(`${name.trim() || email.trim()} added`)
    closeAdd()
  }

  async function submitEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editing) return
    await setRoles.mutateAsync({ profileId: editing.profile_id, roles: editRoles })
    setEditing(null)
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Members"
        helpKey="members"
        actions={
          <Button onClick={() => setAdding(true)}>
            <UserPlus className="mr-1 h-4 w-4" aria-hidden />
            {isCta ? 'Add member' : 'Add learner'}
          </Button>
        }
      />

      <Card>
        <CardContent className="p-0">
          {isLoading && <Skeleton className="m-4 h-24" />}
          <ul className="divide-y divide-border">
            {members?.map((m) => {
              const canEdit = isCta || m.roles.every((r) => r === 'learner')
              return (
                <li key={m.profile_id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-slate-900">{m.profiles?.full_name ?? 'Unknown'}</p>
                      {m.profiles?.is_guest && <Badge variant="neutral">Guest</Badge>}
                      {!m.is_active && <Badge variant="danger">Removed</Badge>}
                      {m.profiles && !m.profiles.is_active && <Badge variant="danger">Deactivated</Badge>}
                    </div>
                    <p className="truncate text-xs text-slate-500">{m.profiles?.email}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {m.is_active && m.roles.map((r) => <Badge key={r}>{CLIENT_ROLE_LABELS[r]}</Badge>)}
                    </div>
                  </div>
                  {canEdit && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditing(m)
                        setEditRoles(m.is_active ? m.roles : [])
                        setRoles.reset()
                      }}
                    >
                      {m.is_active ? 'Change roles' : 'Restore'}
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>
        </CardContent>
      </Card>

      <Dialog open={adding} onOpenChange={(open) => !open && closeAdd()}>
        <DialogContent>
          <form onSubmit={(e) => void submitAdd(e).catch(() => {})} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>{isCta ? 'Add a member' : 'Add a learner'}</DialogTitle>
              <DialogDescription>
                Use the email address they sign in to Microsoft with. People outside RevTech need a guest invitation to
                RevTech's directory before they can sign in.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <Label htmlFor="member-email">Email</Label>
                <Input id="member-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="member-name">Name</Label>
                <Input id="member-name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
            </div>
            <RolePicker value={newRoles} onChange={setNewRoles} allowed={allowed} idPrefix="new" />
            <ErrorText error={add.error} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeAdd}>Cancel</Button>
              <Button type="submit" disabled={!email.trim() || newRoles.length === 0 || add.isPending}>Add</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          {editing && (
            <form onSubmit={(e) => void submitEdit(e).catch(() => {})} className="flex flex-col gap-4">
              <DialogHeader>
                <DialogTitle>{editing.profiles?.full_name}</DialogTitle>
                <DialogDescription>
                  Clearing every role removes them from this client. Their history is kept.
                </DialogDescription>
              </DialogHeader>
              <RolePicker
                value={editRoles}
                onChange={setEditRoles}
                allowed={isCta ? CLIENT_ROLES.filter((r) => !(editing.profile_id === me?.id && r === 'client_training_admin')) : ['learner']}
                idPrefix="edit"
              />
              <ErrorText error={setRoles.error} />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
                <Button type="submit" variant={editRoles.length === 0 ? 'destructive' : 'default'} disabled={setRoles.isPending}>
                  {editRoles.length === 0 ? 'Remove from client' : 'Save roles'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
