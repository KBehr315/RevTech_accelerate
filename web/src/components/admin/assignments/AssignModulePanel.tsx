import { useState } from 'react'
import { toast } from 'sonner'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EmployeePicker } from './EmployeePicker'
import { useModules } from '@/hooks/useModules'
import { useProfiles } from '@/hooks/useProfiles'
import { useBulkAssign } from '@/hooks/useAssignments'
import { useAuthStore } from '@/store/authStore'

export function AssignModulePanel() {
  const [open, setOpen] = useState(true)
  const [moduleId, setModuleId] = useState<string>('')
  const [employeeIds, setEmployeeIds] = useState<string[]>([])
  const [dueAt, setDueAt] = useState('')

  const { data: allModules } = useModules()
  const { data: profiles } = useProfiles()
  const bulkAssign = useBulkAssign()
  const profile = useAuthStore((s) => s.profile)

  // Draft modules aren't visible to employees even if assigned (enforced at
  // the RLS level too) — only offer published ones here so admins can't
  // accidentally assign something unfinished.
  const modules = (allModules ?? []).filter((m) => m.is_published)
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
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create assignment')
    }
  }

  return (
    <Card>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between p-5 text-left"
      >
        <div>
          <p className="font-heading text-base font-semibold text-slate-900">Assign Training</p>
          <p className="text-sm text-slate-500">Assign a module to one or more employees.</p>
        </div>
        {open ? (
          <ChevronUp className="h-5 w-5 shrink-0 text-slate-400" />
        ) : (
          <ChevronDown className="h-5 w-5 shrink-0 text-slate-400" />
        )}
      </button>

      {open && (
        <CardContent className="flex flex-col gap-4 border-t border-border pt-4">
          <div className="flex flex-col gap-1.5">
            <Label>Module</Label>
            <Select value={moduleId} onValueChange={setModuleId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a module…" />
              </SelectTrigger>
              <SelectContent>
                {modules.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {modules.length === 0 && (
              <p className="text-xs text-slate-400">
                No published modules yet — finish and publish one from the Modules page first.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Employees</Label>
            <EmployeePicker employees={employees} selected={employeeIds} onChange={setEmployeeIds} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="due-at">Due date (optional)</Label>
            <Input id="due-at" type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} className="w-48" />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={reset} disabled={bulkAssign.isPending}>
              Clear
            </Button>
            <Button
              onClick={handleAssign}
              disabled={!moduleId || employeeIds.length === 0 || bulkAssign.isPending}
            >
              {bulkAssign.isPending ? 'Assigning…' : 'Assign'}
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  )
}
