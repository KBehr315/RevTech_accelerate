import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'

export function ProtectedRoute() {
  const session = useAuthStore((s) => s.session)
  const loading = useAuthStore((s) => s.loading)

  if (loading) {
    return <div className="flex min-h-svh items-center justify-center text-sm text-slate-500">Loading…</div>
  }

  if (!session) {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}

export function AdminRoute() {
  const profile = useAuthStore((s) => s.profile)
  const loading = useAuthStore((s) => s.loading)

  if (loading) {
    return <div className="flex min-h-svh items-center justify-center text-sm text-slate-500">Loading…</div>
  }

  if (profile?.role !== 'admin') {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}
