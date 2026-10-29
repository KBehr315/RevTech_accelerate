import { PostgrestClient, type PostgrestError } from '@supabase/postgrest-js'
import type { Database } from '@/types/database.types'
import { getIdToken } from '@/lib/msal'
import { viewAsHeader } from '@/store/previewStore'

/** fetch() with the caller's Microsoft ID token attached, for the app's own /api routes. */
export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${await getIdToken()}`)
  const viewAs = viewAsHeader()
  if (viewAs) headers.set('X-View-As', viewAs)
  return fetch(input, { ...init, headers })
}

/**
 * The same query builder supabase-js exposed as `supabase.from()` / `.rpc()`.
 * Requests go to the API server, which verifies the caller and forwards them to
 * PostgREST, where the RLS policies in db/migrations decide what they can see.
 */
export const db = new PostgrestClient<Database>(`${window.location.origin}/api/db`, { fetch: apiFetch })

/**
 * The data from a PostgREST response, or a thrown Error carrying the database's
 * message. Permission checks in the security-definer functions raise messages
 * written for people ("You cannot change these roles"), so they're shown as-is.
 */
export function unwrap<R extends { data: unknown; error: PostgrestError | null }>(response: R): NonNullable<R['data']> {
  // Typed from the whole response rather than `data: T | null`: inside a
  // queryFn, TypeScript would otherwise infer T as null.
  if (response.error) throw new Error(response.error.message || 'The request failed.')
  return response.data as NonNullable<R['data']>
}
