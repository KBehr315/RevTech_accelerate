import { supabase } from '@/lib/supabase'
import type { Assignment, AssignmentStatus } from '@/types/domain'

export async function listMyAssignmentStatus(): Promise<AssignmentStatus[]> {
  const { data, error } = await supabase
    .from('assignment_status')
    .select('*')
    .order('due_at', { ascending: true, nullsFirst: false })
  if (error) throw error
  return data as AssignmentStatus[]
}

export async function listAllAssignmentStatus(): Promise<AssignmentStatus[]> {
  const { data, error } = await supabase.from('assignment_status').select('*')
  if (error) throw error
  return data as AssignmentStatus[]
}

export async function getAssignment(id: string): Promise<Assignment> {
  const { data, error } = await supabase.from('assignments').select('*').eq('id', id).single()
  if (error) throw error
  return data as Assignment
}

export async function createAssignment(input: {
  module_id: string
  employee_id: string
  assigned_by: string
  due_at: string | null
}): Promise<Assignment> {
  const { data, error } = await supabase.from('assignments').insert(input).select('*').single()
  if (error) throw error
  return data as Assignment
}

export async function bulkAssign(input: {
  module_id: string
  employee_ids: string[]
  assigned_by: string
  due_at: string | null
}): Promise<void> {
  const rows = input.employee_ids.map((employee_id) => ({
    module_id: input.module_id,
    employee_id,
    assigned_by: input.assigned_by,
    due_at: input.due_at,
    is_active: true,
  }))
  const { error } = await supabase.from('assignments').upsert(rows, { onConflict: 'module_id,employee_id' })
  if (error) throw error
}

export async function deactivateAssignment(id: string): Promise<void> {
  const { error } = await supabase.from('assignments').update({ is_active: false }).eq('id', id)
  if (error) throw error
}
