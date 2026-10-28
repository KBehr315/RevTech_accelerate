import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { db, unwrap } from '@/lib/db'
import type { Database } from '@/types/database.types'
import type { ClientRole, Job, PlatformRole } from '@/types/domain'

type Tables = Database['public']['Tables']

export function usePlatformSettings() {
  return useQuery({
    queryKey: ['platform', 'settings'],
    queryFn: async () => unwrap(await db.from('platform_settings').select('*').single()),
    staleTime: Infinity,
  })
}

export function useUpdatePlatformSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (changes: Tables['platform_settings']['Update']) =>
      unwrap(await db.from('platform_settings').update(changes).eq('id', true).select().single()),
    onSuccess: (settings) => queryClient.setQueryData(['platform', 'settings'], settings),
  })
}

export function useAllClients() {
  return useQuery({
    queryKey: ['platform', 'clients'],
    queryFn: async () => unwrap(await db.from('clients').select('*').order('name')),
  })
}

export function useCreateClient() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (args: { name: string; slug: string }) =>
      unwrap(await db.rpc('create_client', { p_name: args.name, p_slug: args.slug })),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['platform', 'clients'] })
      void queryClient.invalidateQueries({ queryKey: ['session'] })
    },
  })
}

export interface PersonRow {
  id: string
  email: string
  full_name: string
  is_active: boolean
  is_guest: boolean
  created_at: string
  platform_role_grants: { role: PlatformRole }[]
  memberships: { is_active: boolean; roles: ClientRole[]; client: { id: string; name: string } | null }[]
}

export function usePeople() {
  return useQuery({
    queryKey: ['platform', 'people'],
    queryFn: async () =>
      unwrap(
        await db
          .from('profiles')
          .select('id, email, full_name, is_active, is_guest, created_at, platform_role_grants!platform_role_grants_profile_id_fkey(role), memberships:client_memberships!client_memberships_profile_id_fkey(is_active, roles, client:clients(id, name))')
          .order('full_name'),
      ) as PersonRow[],
  })
}

export function useSetPlatformRole() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (args: { profileId: string; role: PlatformRole; granted: boolean }) =>
      unwrap(await db.rpc('set_platform_role', { p_profile_id: args.profileId, p_role: args.role, p_granted: args.granted })),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['platform', 'people'] })
      void queryClient.invalidateQueries({ queryKey: ['session'] })
    },
  })
}

export function useSetProfileActive() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (args: { profileId: string; active: boolean }) =>
      unwrap(await db.rpc('set_profile_active', { p_profile_id: args.profileId, p_active: args.active })),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['platform', 'people'] }),
  })
}

export function useAiProviders() {
  return useQuery({
    queryKey: ['platform', 'ai-providers'],
    queryFn: async () => unwrap(await db.from('ai_providers').select('*').order('name')),
  })
}

export function useSaveAiProvider() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...fields }: Tables['ai_providers']['Insert'] & { id?: string }) =>
      id
        ? unwrap(await db.from('ai_providers').update(fields).eq('id', id).select().single())
        : unwrap(await db.from('ai_providers').insert(fields).select().single()),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['platform', 'ai-providers'] }),
  })
}

/** Queues a health check and follows it until the worker finishes it. */
/** Starts a job with `enqueue` and polls it until it finishes. */
function useWatchedJob<V>(enqueue: (vars: V) => Promise<Job>) {
  const [jobId, setJobId] = useState<string | null>(null)
  const start = useMutation({ mutationFn: enqueue, onSuccess: (job) => setJobId(job.id) })
  const job = useQuery({
    queryKey: ['jobs', jobId],
    enabled: !!jobId,
    queryFn: async () => unwrap(await db.from('jobs').select('*').eq('id', jobId!).single()),
    refetchInterval: (query) => (['succeeded', 'failed'].includes(query.state.data?.status ?? '') ? false : 2_000),
  })
  return { start, job }
}

export function useHealthCheck() {
  return useWatchedJob<void>(async () => unwrap(await db.rpc('request_health_check')))
}

export function useAiProviderTest() {
  return useWatchedJob<string>(async (providerId) =>
    unwrap(await db.rpc('request_ai_provider_test', { p_provider_id: providerId })),
  )
}

export function usePlatformAudit() {
  return useQuery({
    queryKey: ['audit', 'platform'],
    queryFn: async () =>
      unwrap(await db.from('audit_events').select('*').is('client_id', null).order('at', { ascending: false }).limit(200)),
  })
}
