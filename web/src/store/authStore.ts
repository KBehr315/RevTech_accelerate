import { create } from 'zustand'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Profile } from '@/types/domain'

interface AuthState {
  session: Session | null
  profile: Profile | null
  loading: boolean
  error: string | null
  initialize: () => Promise<void>
  signInWithAzure: () => Promise<void>
  signOut: () => Promise<void>
}

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single()
  if (error) {
    console.error('Failed to load profile', error)
    return null
  }
  return data as Profile
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  profile: null,
  loading: true,
  error: null,

  initialize: async () => {
    const { data } = await supabase.auth.getSession()
    const session = data.session
    const profile = session ? await fetchProfile(session.user.id) : null
    set({ session, profile, loading: false })

    supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      const nextProfile = nextSession ? await fetchProfile(nextSession.user.id) : null
      set({ session: nextSession, profile: nextProfile })
    })
  },

  signInWithAzure: async () => {
    set({ error: null })
    // Full-page redirect to Microsoft — there's no immediate success/failure
    // to return here. Supabase picks the session up automatically once the
    // browser lands back on this app, via the onAuthStateChange listener above.
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'azure',
      options: { scopes: 'openid profile email' },
    })
    if (error) set({ error: error.message })
  },

  signOut: async () => {
    await supabase.auth.signOut()
    set({ session: null, profile: null })
  },
}))
