import { useState } from 'react'
import { toast } from 'sonner'
import { ChevronDown, ChevronUp, Search } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EmployeePicker } from './EmployeePicker'
import { useModules } from '@/hooks/useModules'
import { useProfiles } from '@/hooks/useProfiles'
import { useBulkAssign } from '@/hooks/useAssignments'
import { useAllMemberships, useGroups } from '@/hooks/useGroups'
import { useAuthStore } from '@/store/authStore'
import { moduleMatchesSearch } from '@/lib/utils'

export function AssignModulePanel() {
  const [open, setOpen] = useState(true)
  const [moduleId, setModuleId] = useState<string>('')
  const [moduleSearch, setModuleSearch] = useState('')
  const [employeeIds, setEmployeeIds] = useState<string[]>([])
  const [dueAt, setDueAt] = useState('')

  const { data: allModules } = useModules()
  const { data: profiles } = useProfiles()
  const { data: groups } = useGroups()
  const { data: memberships } = useAllMemberships()
  const bulkAssign = useBulkAssign()
  const profile = useAuthStore((s) => s.profile)

  // Draft modules aren't visible to employees even if assigned (enforced at
  // the RLS level too) — only offer published ones here so admins can't
  // accidentally assign something unfinished.
  const modules = (allModules ?? []).filter((m) => m.is_published)
  const filteredModules = modules.filter((m) => moduleMatchesSearch(m, moduleSearch))
  const employees = (profiles ?? []).filter((p) => p.role === 'employee' && p.is_active)

  function reset() {
    setModuleId('')
    setModuleSearch('')
    setEmployeeIds([])
    setDueAt('')
  }

  function addGroup(groupId: string) {
    const memberIds = (memberships ?? []).filter((m) => m.group_id === groupId).map((m) => m.employee_id)
    setEmployeeIds((prev) => Array.from(new Set([...prev, ...memberIds])))
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
    <Card className={open ? 'bg-brand-100/60' : undefined}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between p-5 text-left"
      >
        <div>
          <p className="font-heading text-[17.3px] font-semibold text-[#0B76A0]">Assign Training</p>
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
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={moduleSearch}
                onChange={(e) => setModuleSearch(e.target.value)}
                placeholder="Search by title or topic…"
                className="pl-8"
              />
            </div>
            <Select value={moduleId} onValueChange={setModuleId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a module…" />
              </SelectTrigger>
              <SelectContent>
                {filteredModules.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.title}
                    {m.topics.length > 0 && ` (${m.topics.join(', ')})`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {modules.length === 0 && (
              <p className="text-xs text-slate-400">
                No published modules yet — finish and publish one from the Modules page first.
              </p>
            )}
            {modules.length > 0 && filteredModules.length === 0 && (
              <p className="text-xs text-slate-400">No modules match "{moduleSearch}".</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Employees</Label>
            {groups && groups.length > 0 && (
              <Select value="" onValueChange={addGroup}>
                <SelectTrigger className="w-64">
                  <SelectValue placeholder="Add everyone from a group…" />
                </SelectTrigger>
                <SelectContent>
                  {groups.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
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
