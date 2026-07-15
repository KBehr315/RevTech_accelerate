import { useState } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import type { Profile } from '@/types/domain'

interface EmployeePickerProps {
  employees: Profile[]
  selected: string[]
  onChange: (ids: string[]) => void
}

export function EmployeePicker({ employees, selected, onChange }: EmployeePickerProps) {
  const [search, setSearch] = useState('')

  const filtered = employees.filter(
    (e) =>
      e.full_name.toLowerCase().includes(search.toLowerCase()) ||
      e.email.toLowerCase().includes(search.toLowerCase()),
  )

  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id])
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <Input placeholder="Search employees…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <button
          type="button"
          onClick={() => onChange(filtered.map((e) => e.id))}
          className="shrink-0 text-xs text-brand-600 hover:underline"
        >
          Select all
        </button>
        <button
          type="button"
          onClick={() => onChange([])}
          className="shrink-0 text-xs text-slate-500 hover:underline"
        >
          Clear
        </button>
      </div>
      <div className="max-h-64 overflow-y-auto rounded-lg border border-border">
        {filtered.length === 0 && <p className="p-3 text-sm text-slate-400">No employees match.</p>}
        {filtered.map((employee) => (
          <label
            key={employee.id}
            className="flex cursor-pointer items-center gap-2 border-b border-border px-3 py-2 text-sm last:border-b-0 hover:bg-surface-muted"
          >
            <Checkbox checked={selected.includes(employee.id)} onCheckedChange={() => toggle(employee.id)} />
            <span className="font-medium text-slate-800">{employee.full_name}</span>
            <span className="text-xs text-slate-400">{employee.email}</span>
          </label>
        ))}
      </div>
      <p className="text-xs text-slate-500">{selected.length} selected</p>
    </div>
  )
}
