import { useState } from 'react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { EmployeePicker } from '@/components/admin/assignments/EmployeePicker'
import { useSetGroupMembers } from '@/hooks/useGroups'
import type { EmployeeGroup, Profile } from '@/types/domain'

interface GroupMembersDialogProps {
  group: EmployeeGroup
  employees: Profile[]
  currentMemberIds: string[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function GroupMembersDialog({ group, employees, currentMemberIds, open, onOpenChange }: GroupMembersDialogProps) {
  const [selected, setSelected] = useState<string[]>(currentMemberIds)
  const setGroupMembers = useSetGroupMembers()

  function handleOpenChange(next: boolean) {
    if (next) setSelected(currentMemberIds)
    onOpenChange(next)
  }

  async function handleSave() {
    try {
      await setGroupMembers.mutateAsync({ groupId: group.id, employeeIds: selected })
      toast.success(`${group.name} updated — ${selected.length} member${selected.length === 1 ? '' : 's'}`)
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update group members')
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Manage Members — {group.name}</DialogTitle>
          <DialogDescription>Choose who belongs to this group.</DialogDescription>
        </DialogHeader>

        <EmployeePicker employees={employees} selected={selected} onChange={setSelected} />

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={setGroupMembers.isPending}>
            {setGroupMembers.isPending ? 'Saving…' : 'Save Members'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
