import { NavLink, Outlet } from 'react-router-dom'
import { GraduationCap, LayoutDashboard, LogOut, ClipboardList, Users, BookOpen, BarChart3 } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { cn, initials } from '@/lib/utils'

const EMPLOYEE_LINKS = [{ to: '/', label: 'My Training', icon: GraduationCap, end: true }]

const ADMIN_LINKS = [
  { to: '/admin', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/admin/modules', label: 'Modules', icon: BookOpen, end: false },
  { to: '/admin/assignments', label: 'Assignments', icon: ClipboardList, end: false },
  { to: '/admin/users', label: 'Employees', icon: Users, end: false },
  { to: '/admin/reports', label: 'Compliance Reports', icon: BarChart3, end: false },
]

export function AppShell() {
  const profile = useAuthStore((s) => s.profile)
  const signOut = useAuthStore((s) => s.signOut)
  const isAdmin = profile?.role === 'admin'
  const links = isAdmin ? ADMIN_LINKS : EMPLOYEE_LINKS

  return (
    <div className="flex min-h-svh">
      <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-white">
        <div className="flex items-center border-b border-border px-4 py-4">
          <img src="/revtech-logo.png" alt="RevTech" className="h-6 w-auto" />
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-3">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-surface-muted',
                  isActive && 'bg-brand-50 text-brand-700',
                )
              }
            >
              <link.icon className="h-4 w-4" />
              {link.label}
            </NavLink>
          ))}
        </nav>
        <div className="flex items-center gap-2 border-t border-border p-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-800">
            {profile ? initials(profile.full_name) : '—'}
          </div>
          <div className="flex-1 overflow-hidden">
            <p className="truncate text-sm font-medium text-slate-900">{profile?.full_name ?? 'Loading…'}</p>
            <p className="truncate text-xs text-slate-500">{profile?.role === 'admin' ? 'Admin' : 'Employee'}</p>
          </div>
          <button
            onClick={() => void signOut()}
            className="rounded-md p-1.5 text-slate-400 hover:bg-surface-muted hover:text-slate-600"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl p-6">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
