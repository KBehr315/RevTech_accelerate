import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

// Admin-only: creates a new employee auth account (via Supabase Auth invite email)
// and lets the handle_new_user() trigger auto-create the matching profiles row.
// Runs with the Supabase service-role key, so it must verify the caller is an
// admin itself before doing anything privileged — never trust a client-passed flag.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing authorization header' })
    return
  }
  const accessToken = authHeader.slice('Bearer '.length)

  const supabaseUrl = process.env.SUPABASE_URL
  const anonKey = process.env.SUPABASE_ANON_KEY
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    res.status(500).json({ error: 'Server is missing Supabase configuration' })
    return
  }

  // Verify the caller's own JWT identifies a signed-in admin.
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  })

  const {
    data: { user },
    error: userError,
  } = await callerClient.auth.getUser()

  if (userError || !user) {
    res.status(401).json({ error: 'Invalid or expired session' })
    return
  }

  const { data: callerProfile, error: profileError } = await callerClient
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profileError || callerProfile?.role !== 'admin') {
    res.status(403).json({ error: 'Admin access required' })
    return
  }

  const { email, full_name } = (req.body ?? {}) as { email?: string; full_name?: string }
  if (!email || typeof email !== 'string' || !full_name || typeof full_name !== 'string') {
    res.status(400).json({ error: 'email and full_name are required' })
    return
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey)

  const { data, error } = await adminClient.auth.admin.inviteUserByEmail(email, {
    data: { full_name },
  })

  if (error) {
    res.status(400).json({ error: error.message })
    return
  }

  res.status(200).json({ user_id: data.user.id })
}
