import { useState } from 'react'
import { toast } from 'sonner'
import { ChevronDown, ChevronUp, Trash2, Users as UsersIcon } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { EmployeePicker } from '@/components/admin/assignments/EmployeePicker'
import { GroupMembersDialog } from './GroupMembersDialog'
import { useGroups, useAllMemberships, useCreateGroup, useDeleteGroup, useSetGroupMembers } from '@/hooks/useGroups'
import { useProfiles } from '@/hooks/useProfiles'
import { useAuthStore } from '@/store/authStore'
import type { EmployeeGroup } from '@/types/domain'

export function GroupsPanel() {
  const [open, setOpen] = useState(true)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [memberIds, setMemberIds] = useState<string[]>([])
  const [managingGroup, setManagingGroup] = useState<EmployeeGroup | null>(null)

  const { data: groups } = useGroups()
  const { data: memberships } = useAllMemberships()
  const { data: profiles } = useProfiles()
  const createGroup = useCreateGroup()
  const deleteGroup = useDeleteGroup()
  const setGroupMembers = useSetGroupMembers()
  const profile = useAuthStore((s) => s.profile)

  const employees = (profiles ?? []).filter((p) => p.role === 'employee' && p.is_active)

  function membersOf(groupId: string): string[] {
    return (memberships ?? []).filter((m) => m.group_id === groupId).map((m) => m.employee_id)
  }

  function reset() {
    setName('')
    setDescription('')
    setMemberIds([])
  }

  async function handleCreate() {
    if (!profile || !name.trim()) return
    try {
      const group = await createGroup.mutateAsync({
        name: name.trim(),
        description: description.trim() || null,
        created_by: profile.id,
      })
      if (memberIds.length > 0) {
        await setGroupMembers.mutateAsync({ groupId: group.id, employeeIds: memberIds })
      }
      toast.success(`Group "${group.name}" created`)
      reset()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create group')
    }
  }

  async function handleDelete(group: EmployeeGroup) {
    if (!confirm(`Delete the "${group.name}" group? Employees already assigned training keep it — this only removes the group.`)) return
    try {
      await deleteGroup.mutateAsync(group.id)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not delete group')
    }
  }

  return (
    <Card className={open ? 'bg-brand-100/60' : undefined}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between p-5 text-left"
      >
        <div>
          <p className="font-heading text-base font-semibold text-slate-900">Employee Groups</p>
          <p className="text-sm text-slate-500">Group employees together to batch-assign training.</p>
        </div>
        {open ? (
          <ChevronUp className="h-5 w-5 shrink-0 text-slate-400" />
        ) : (
          <ChevronDown className="h-5 w-5 shrink-0 text-slate-400" />
        )}
      </button>

      {open && (
        <CardContent className="flex flex-col gap-6 border-t border-border pt-4">
          <div className="flex flex-col gap-4 rounded-lg border border-border p-4">
            <p className="text-sm font-medium text-slate-700">New Group</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="group-name">Name</Label>
                <Input id="group-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Engineering" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="group-description">Description (optional)</Label>
                <Input
                  id="group-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. All engineering staff"
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Members</Label>
              <EmployeePicker employees={employees} selected={memberIds} onChange={setMemberIds} />
            </div>
            <Button onClick={handleCreate} disabled={!name.trim() || createGroup.isPending} className="w-fit">
              {createGroup.isPending ? 'Creating…' : 'Create Group'}
            </Button>
          </div>

          <div className="flex flex-col gap-2">
            {(groups ?? []).length === 0 && (
              <p className="py-4 text-center text-sm text-slate-400">No groups yet — create one above.</p>
            )}
            {groups?.map((group) => {
              const count = membersOf(group.id).length
              return (
                <div key={group.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{group.name}</p>
                    <p className="flex items-center gap-1 text-xs text-slate-500">
                      <UsersIcon className="h-3 w-3" />
                      {count} member{count === 1 ? '' : 's'}
                      {group.description && ` · ${group.description}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => setManagingGroup(group)}>
                      Manage Members
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(group)}>
                      <Trash2 className="h-4 w-4 text-status-red" />
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      )}

      {managingGroup && (
        <GroupMembersDialog
          group={managingGroup}
          employees={employees}
          currentMemberIds={membersOf(managingGroup.id)}
          open={!!managingGroup}
          onOpenChange={(next) => !next && setManagingGroup(null)}
        />
      )}
    </Card>
  )
}
