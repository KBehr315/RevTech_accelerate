import { supabase } from '@/lib/supabase'
import type { Profile, Role } from '@/types/domain'

export async function listProfiles(): Promise<Profile[]> {
  const { data, error } = await supabase.from('profiles').select('*').order('full_name', { ascending: true })
  if (error) throw error
  return data as Profile[]
}

export async function setProfileActive(id: string, isActive: boolean): Promise<void> {
  const { error } = await supabase.from('profiles').update({ is_active: isActive }).eq('id', id)
  if (error) throw error
}

export async function setProfileRole(id: string, role: Role): Promise<void> {
  const { error } = await supabase.from('profiles').update({ role }).eq('id', id)
  if (error) throw error
}

export async function inviteEmployee(input: { email: string; full_name: string }): Promise<{ user_id: string }> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) throw new Error('Not signed in')

  const res = await fetch('/api/invite-employee', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(input),
  })

  const body = await res.json()
  if (!res.ok) throw new Error(body.error ?? 'Failed to invite employee')
  return body as { user_id: string }
}
