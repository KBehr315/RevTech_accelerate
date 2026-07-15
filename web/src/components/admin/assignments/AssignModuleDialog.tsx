import { useState } from 'react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus } from 'lucide-react'
import { EmployeePicker } from './EmployeePicker'
import { useModules } from '@/hooks/useModules'
import { useProfiles } from '@/hooks/useProfiles'
import { useBulkAssign } from '@/hooks/useAssignments'
import { useAuthStore } from '@/store/authStore'

export function AssignModuleDialog() {
  const [open, setOpen] = useState(false)
  const [moduleId, setModuleId] = useState<string>('')
  const [employeeIds, setEmployeeIds] = useState<string[]>([])
  const [dueAt, setDueAt] = useState('')

  const { data: modules } = useModules()
  const { data: profiles } = useProfiles()
  const bulkAssign = useBulkAssign()
  const profile = useAuthStore((s) => s.profile)

  const employees = (profiles ?? []).filter((p) => p.role === 'employee' && p.is_active)

  function reset() {
    setModuleId('')
    setEmployeeIds([])
    setDueAt('')
  }

  async function handleAssign() {
    if (!profile || !moduleId || employeeIds.length === 0) return
    try {
      await bulkAssign.mutateAsync({
        module_id: moduleId,
        employee_ids: employeeIds,
        assigned_by: profile.id,
        due_at: dueAt ? new Date(dueAt).toISOString() : null,
      })
      toast.success(`Assigned to ${employeeIds.length} employee${employeeIds.length === 1 ? '' : 's'}`)
      reset()
      setOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create assignment')
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" />
          New Assignment
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Assign Training</DialogTitle>
          <DialogDescription>Assign a module to one or more employees.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Module</Label>
            <Select value={moduleId} onValueChange={setModuleId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a module…" />
              </SelectTrigger>
              <SelectContent>
                {(modules ?? []).map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Employees</Label>
            <EmployeePicker employees={employees} selected={employeeIds} onChange={setEmployeeIds} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="due-at">Due date (optional)</Label>
            <Input id="due-at" type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleAssign}
            disabled={!moduleId || employeeIds.length === 0 || bulkAssign.isPending}
          >
            {bulkAssign.isPending ? 'Assigning…' : 'Assign'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
