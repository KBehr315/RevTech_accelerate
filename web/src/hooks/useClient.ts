import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { db, unwrap } from '@/lib/db'
import type { Database } from '@/types/database.types'
import type { ClientRole } from '@/types/domain'

type Tables = Database['public']['Tables']
type ClientUpdate = Tables['clients']['Update']
type SetupTable = 'client_workstreams' | 'client_business_roles' | 'client_terms'

export function useClient(clientId: string | undefined) {
  return useQuery({
    queryKey: ['client', clientId],
    enabled: !!clientId,
    queryFn: async () => unwrap(await db.from('clients').select('*').eq('id', clientId!).single()),
  })
}

export function useUpdateClient(clientId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (changes: ClientUpdate) =>
      unwrap(await db.from('clients').update(changes).eq('id', clientId).select().single()),
    onSuccess: (client) => {
      queryClient.setQueryData(['client', clientId], client)
      void queryClient.invalidateQueries({ queryKey: ['session'] })
    },
  })
}

export function useActivateClient(clientId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => unwrap(await db.rpc('activate_client', { p_client_id: clientId })),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['client', clientId] })
      void queryClient.invalidateQueries({ queryKey: ['session'] })
      void queryClient.invalidateQueries({ queryKey: ['platform', 'clients'] })
    },
  })
}

/** Workstreams, business roles and glossary terms share the same list/add/remove shape. */
export function useSetupRows<T extends SetupTable>(table: T, clientId: string) {
  const queryClient = useQueryClient()
  const key = [table, clientId]
  // The three tables share the id/client_id/created_at columns this hook uses;
  // the query builder can't resolve a union of table names, so type it as one.
  const from = () => db.from(table as 'client_terms')

  const rows = useQuery({
    queryKey: key,
    queryFn: async () =>
      unwrap(await from().select('*').eq('client_id', clientId).order('created_at')) as unknown as Tables[T]['Row'][],
  })

  const add = useMutation({
    mutationFn: async (row: Omit<Tables[T]['Insert'], 'client_id'>) =>
      unwrap(await from().insert({ ...row, client_id: clientId } as Tables['client_terms']['Insert']).select().single()),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: key }),
  })

  const remove = useMutation({
    mutationFn: async (id: string) => unwrap(await from().delete().eq('id', id)),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: key }),
  })

  return { rows, add, remove }
}

export interface MemberRow {
  profile_id: string
  roles: ClientRole[]
  is_active: boolean
  profiles: { full_name: string; email: string; is_guest: boolean; is_active: boolean } | null
}

export function useMembers(clientId: string) {
  return useQuery({
    queryKey: ['members', clientId],
    queryFn: async () =>
      unwrap(
        await db
          .from('client_memberships')
          .select('profile_id, roles, is_active, profiles!client_memberships_profile_id_fkey(full_name, email, is_guest, is_active)')
          .eq('client_id', clientId),
      ).sort((a, b) => (a.profiles?.full_name ?? '').localeCompare(b.profiles?.full_name ?? '')) as MemberRow[],
  })
}

export function useAddMember(clientId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (args: { email: string; name: string; roles: ClientRole[] }) =>
      unwrap(
        await db
          .rpc('add_client_member', { p_client_id: clientId, p_email: args.email, p_name: args.name, p_roles: args.roles }),
      ),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['members', clientId] }),
  })
}

export function useSetMemberRoles(clientId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (args: { profileId: string; roles: ClientRole[] }) =>
      unwrap(await db.rpc('set_client_roles', { p_client_id: clientId, p_profile_id: args.profileId, p_roles: args.roles })),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['members', clientId] })
      void queryClient.invalidateQueries({ queryKey: ['session'] })
    },
  })
}

export function useClientAudit(clientId: string) {
  return useQuery({
    queryKey: ['audit', clientId],
    queryFn: async () =>
      unwrap(
        await db.from('audit_events').select('*').eq('client_id', clientId).order('at', { ascending: false }).limit(200),
      ),
  })
}
