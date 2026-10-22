import { db } from '@/lib/db'
import type { EmployeeGroup, EmployeeGroupMember } from '@/types/domain'

export async function listGroups(): Promise<EmployeeGroup[]> {
  const { data, error } = await db.from('employee_groups').select('*').order('name', { ascending: true })
  if (error) throw error
  return data as EmployeeGroup[]
}

/** All group/employee pairs across every group, for deriving member lists and counts client-side. */
export async function listAllMemberships(): Promise<EmployeeGroupMember[]> {
  const { data, error } = await db.from('employee_group_members').select('*')
  if (error) throw error
  return data as EmployeeGroupMember[]
}

export async function createGroup(input: { name: string; description: string | null; created_by: string }): Promise<EmployeeGroup> {
  const { data, error } = await db.from('employee_groups').insert(input).select('*').single()
  if (error) throw error
  return data as EmployeeGroup
}

export async function updateGroup(id: string, input: { name?: string; description?: string | null }): Promise<EmployeeGroup> {
  const { data, error } = await db.from('employee_groups').update(input).eq('id', id).select('*').single()
  if (error) throw error
  return data as EmployeeGroup
}

export async function deleteGroup(id: string): Promise<void> {
  const { error } = await db.from('employee_groups').delete().eq('id', id)
  if (error) throw error
}

/** Replaces a group's full membership list with the given set of employee ids. */
export async function setGroupMembers(groupId: string, employeeIds: string[]): Promise<void> {
  const { error: deleteError } = await db.from('employee_group_members').delete().eq('group_id', groupId)
  if (deleteError) throw deleteError

  if (employeeIds.length === 0) return

  const { error: insertError } = await db
    .from('employee_group_members')
    .insert(employeeIds.map((employee_id) => ({ group_id: groupId, employee_id })))
  if (insertError) throw insertError
}
