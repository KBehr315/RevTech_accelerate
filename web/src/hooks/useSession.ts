import { useQuery } from '@tanstack/react-query'
import { db, unwrap } from '@/lib/db'
import { useAuthStore } from '@/store/authStore'
import { usePreviewStore } from '@/store/previewStore'
import type { Client, ClientRole, PlatformRole } from '@/types/domain'

export interface Workspace {
  client: Pick<Client, 'id' | 'name' | 'slug' | 'status' | 'branding'>
  roles: ClientRole[]
}

export interface Session {
  platformRoles: PlatformRole[]
  workspaces: Workspace[]
}

/**
 * What the signed-in person may do: their platform roles and the client
 * workspaces they belong to. Navigation is built from this; the database
 * enforces the same rules independently.
 */
export function useSession() {
  const profileId = useAuthStore((s) => s.profile?.id)
  const preview = usePreviewStore((s) => s.preview)

  return useQuery({
    queryKey: ['session', profileId, preview?.client.id ?? null, preview?.role ?? null],
    enabled: !!profileId,
    queryFn: async (): Promise<Session> => {
      // While previewing, the person is only the previewed role in that one client.
      if (preview) {
        const client = unwrap(
          await db.from('clients').select('id, name, slug, status, branding').eq('id', preview.client.id).single(),
        )
        return { platformRoles: [], workspaces: [{ client, roles: [preview.role] }] }
      }
      const [grants, memberships] = await Promise.all([
        db.from('platform_role_grants').select('role').eq('profile_id', profileId!),
        db
          .from('client_memberships')
          .select('roles, clients(id, name, slug, status, branding)')
          .eq('profile_id', profileId!)
          .eq('is_active', true),
      ])
      return {
        platformRoles: unwrap(grants).map((g) => g.role),
        workspaces: unwrap(memberships)
          .filter((m) => m.clients && m.clients.status !== 'archived')
          .map((m) => ({ client: m.clients!, roles: m.roles }))
          .sort((a, b) => a.client.name.localeCompare(b.client.name)),
      }
    },
  })
}

export function hasPlatformRole(session: Session | undefined, role: PlatformRole): boolean {
  return !!session?.platformRoles.includes(role)
}

/** A workspace where the person only takes training goes to the learner view. */
export function isLearnerOnly(workspace: Workspace): boolean {
  return workspace.roles.every((r) => r === 'learner')
}

export interface Destination {
  key: string
  to: string
  kind: 'client' | 'global' | 'platform' | 'learn'
  label: string
  workspace?: Workspace
}

/** Every context the person can open, in the order the context picker lists them. */
export function destinations(session: Session): Destination[] {
  const list: Destination[] = session.workspaces
    .filter((w) => !isLearnerOnly(w))
    .map((w) => ({ key: w.client.id, to: `/c/${w.client.slug}`, kind: 'client', label: w.client.name, workspace: w }))
  if (session.workspaces.some((w) => w.roles.includes('learner'))) {
    list.push({ key: 'learn', to: '/learn', kind: 'learn', label: 'My training' })
  }
  // Platform Administrators reach Global from the Platform administration menu.
  if (session.platformRoles.includes('global_knowledge_admin') && !session.platformRoles.includes('platform_admin')) {
    list.push({ key: 'global', to: '/global', kind: 'global', label: 'Global Context' })
  }
  if (session.platformRoles.includes('platform_admin')) {
    list.push({ key: 'platform', to: '/platform', kind: 'platform', label: 'Platform administration' })
  }
  return list
}
