import { create } from 'zustand'
import type { AccountInfo } from '@azure/msal-browser'
import { msalReady, signIn as msalSignIn, signOut as msalSignOut } from '@/lib/msal'
import { apiFetch } from '@/lib/db'
import type { Profile } from '@/types/domain'

interface AuthState {
  account: AccountInfo | null
  profile: Profile | null
  loading: boolean
  error: string | null
  initialize: () => Promise<void>
  signIn: () => Promise<void>
  signOut: () => Promise<void>
}

/** The caller's profile; the server creates it the first time someone signs in. */
async function fetchProfile(): Promise<Profile> {
  const res = await apiFetch('/api/me')
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.message ?? 'Could not load your profile.')
  return body as Profile
}

export const useAuthStore = create<AuthState>((set) => ({
  account: null,
  profile: null,
  loading: true,
  error: null,

  initialize: async () => {
    try {
      const account = await msalReady()
      const profile = account ? await fetchProfile() : null
      set({ account, profile, loading: false })
    } catch (err) {
      // Signed in with Microsoft but refused by the server (e.g. deactivated):
      // back to the sign-in page, with the reason.
      set({ account: null, profile: null, loading: false, error: (err as Error).message })
    }
  },

  // Full-page redirect to Microsoft; initialize() picks the account up on return.
  signIn: async () => {
    set({ error: null })
    try {
      await msalSignIn()
    } catch (err) {
      set({ error: (err as Error).message })
    }
  },

  signOut: async () => {
    set({ account: null, profile: null })
    await msalSignOut()
  },
}))
