import { Link, Navigate, Outlet } from 'react-router-dom'
import { FullPageMessage } from '@/components/auth/ProtectedRoute'
import { useActiveContext } from '@/components/shell/context'
import { isLearnerOnly, useSession } from '@/hooks/useSession'
import { useWorkspace } from './workspace'
import type { ClientRole } from '@/types/domain'

/** Resolves /c/:slug to a workspace the person belongs to, for every page beneath it. */
export function ClientLayout() {
  const context = useActiveContext()
  const { isLoading } = useSession()

  if (isLoading) return <FullPageMessage>Loading…</FullPageMessage>
  const workspace = context.kind === 'client' ? context.workspace : undefined
  if (!workspace) {
    return (
      <FullPageMessage>
        <span>
          You don't have access to this workspace, or it doesn't exist.{' '}
          <Link to="/contexts" className="text-brand-600 hover:underline">Choose another</Link>
        </span>
      </FullPageMessage>
    )
  }
  if (isLearnerOnly(workspace)) return <Navigate to="/learn" replace />
  return <Outlet context={workspace} />
}

/** Hides pages a role can't use; the database refuses the underlying requests anyway. */
export function RequireClientRole({ anyOf }: { anyOf: ClientRole[] }) {
  const workspace = useWorkspace()
  if (!workspace.roles.some((r) => anyOf.includes(r))) return <Navigate to={`/c/${workspace.client.slug}`} replace />
  return <Outlet context={workspace} />
}
