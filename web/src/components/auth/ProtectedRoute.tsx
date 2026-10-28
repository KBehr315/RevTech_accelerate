import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { hasPlatformRole, useSession } from '@/hooks/useSession'
import type { PlatformRole } from '@/types/domain'

export function FullPageMessage({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-[40svh] items-center justify-center p-6 text-center text-sm text-slate-500">{children}</div>
}

export function ProtectedRoute() {
  const profile = useAuthStore((s) => s.profile)
  const loading = useAuthStore((s) => s.loading)

  if (loading) return <FullPageMessage>Loading…</FullPageMessage>
  if (!profile) return <Navigate to="/login" replace />
  return <Outlet />
}

/** Hides a section from people without the platform role. The database refuses them anyway. */
export function RequirePlatformRole({ role }: { role: PlatformRole }) {
  const { data: session, isLoading } = useSession()

  if (isLoading) return <FullPageMessage>Loading…</FullPageMessage>
  if (!hasPlatformRole(session, role)) return <Navigate to="/" replace />
  return <Outlet />
}
