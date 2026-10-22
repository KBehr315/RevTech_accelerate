import { PostgrestClient } from '@supabase/postgrest-js'
import type { Database } from '@/types/database.types'
import { getIdToken } from '@/lib/msal'

/** fetch() with the caller's Microsoft ID token attached, for the app's own /api routes. */
export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${await getIdToken()}`)
  return fetch(input, { ...init, headers })
}

/**
 * The same query builder supabase-js exposed as `supabase.from()` / `.rpc()`.
 * Requests go to the API server, which verifies the caller and forwards them to
 * PostgREST, where the RLS policies in db/migrations decide what they can see.
 */
export const db = new PostgrestClient<Database>(`${window.location.origin}/api/db`, { fetch: apiFetch })
