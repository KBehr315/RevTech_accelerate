import { db } from '@/lib/db'
import type { Profile, Role } from '@/types/domain'

export async function listProfiles(): Promise<Profile[]> {
  const { data, error } = await db.from('profiles').select('*').order('full_name', { ascending: true })
  if (error) throw error
  return data as Profile[]
}

export async function setProfileActive(id: string, isActive: boolean): Promise<void> {
  const { error } = await db.from('profiles').update({ is_active: isActive }).eq('id', id)
  if (error) throw error
}

export async function setProfileRole(id: string, role: Role): Promise<void> {
  const { error } = await db.from('profiles').update({ role }).eq('id', id)
  if (error) throw error
}
