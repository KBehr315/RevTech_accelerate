import { NavLink, Outlet } from 'react-router-dom'
import {
  Building2,
  Cpu,
  FileClock,
  GraduationCap,
  Home,
  Library,
  LogOut,
  Settings,
  SlidersHorizontal,
  Users,
  UsersRound,
  type LucideIcon,
} from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { useSession } from '@/hooks/useSession'
import { cn, initials } from '@/lib/utils'
import { useActiveContext, type ActiveContext } from './context'
import { ContextSwitcher } from './ContextSwitcher'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
}

function navFor(context: ActiveContext): NavItem[] {
  switch (context.kind) {
    case 'client': {
      const base = `/c/${context.slug}`
      const roles = context.workspace?.roles ?? []
      const isCta = roles.includes('client_training_admin')
      const items: NavItem[] = [{ to: base, label: 'Home', icon: Home, end: true }]
      if (isCta) items.push({ to: `${base}/setup`, label: 'Client setup', icon: SlidersHorizontal })
      if (isCta || roles.includes('contributor') || roles.includes('reviewer')) {
        items.push({ to: `${base}/library`, label: 'Library', icon: Library })
      }
      if (isCta || roles.includes('lms_admin')) items.push({ to: `${base}/members`, label: 'Members', icon: Users })
      if (isCta) items.push({ to: `${base}/audit`, label: 'Audit log', icon: FileClock })
      return items
    }
    case 'global':
      return [
        { to: '/global', label: 'Home', icon: Home, end: true },
        { to: '/global/library', label: 'Library', icon: Library },
        { to: '/global/client-groups', label: 'Client groups', icon: UsersRound },
      ]
    case 'platform':
      return [
        { to: '/platform', label: 'Overview', icon: Home, end: true },
        { to: '/platform/clients', label: 'Clients', icon: Building2 },
        { to: '/platform/people', label: 'People & roles', icon: Users },
        { to: '/platform/ai-providers', label: 'AI providers', icon: Cpu },
        { to: '/platform/audit', label: 'Audit log', icon: FileClock },
        { to: '/platform/settings', label: 'Settings', icon: Settings },
      ]
    case 'learn':
      return [{ to: '/learn', label: 'My training', icon: GraduationCap, end: true }]
    default:
      return []
  }
}

export function AppShell() {
  const profile = useAuthStore((s) => s.profile)
  const signOut = useAuthStore((s) => s.signOut)
  const context = useActiveContext()
  const { data: session } = useSession()
  const links = navFor(context)
  const hasOtherContexts = (session?.workspaces.length ?? 0) + (session?.platformRoles.length ?? 0) > 1

  return (
    <div className="flex min-h-svh">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-white md:flex">
        <div className="flex flex-col items-center justify-center gap-1 border-b border-border px-2 py-3">
          <img src="/revtech-logo.png" alt="RevTech" className="h-[72px] w-auto" />
          <span className="text-center font-heading text-sm font-bold uppercase tracking-wide text-brand-900">
            Accelerate
          </span>
        </div>
        <nav aria-label="Main" className="flex flex-1 flex-col gap-1 p-3">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-surface-muted hover:text-[#0B76A0]',
                  isActive && 'bg-brand-50 text-brand-700',
                )
              }
            >
              <link.icon className="h-4 w-4" aria-hidden />
              {link.label}
            </NavLink>
          ))}
          {hasOtherContexts && (
            <NavLink
              to="/contexts"
              className="mt-auto flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-500 hover:bg-surface-muted"
            >
              All workspaces
            </NavLink>
          )}
        </nav>
        <div className="flex items-center gap-2 border-t border-border p-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-800">
            {profile ? initials(profile.full_name) : '—'}
          </div>
          <div className="flex-1 overflow-hidden">
            <p className="truncate text-sm font-medium text-slate-900">{profile?.full_name ?? 'Loading…'}</p>
            <p className="truncate text-xs text-slate-500">{profile?.email}</p>
          </div>
          <button
            onClick={() => void signOut()}
            className="rounded-md p-1.5 text-slate-400 hover:bg-surface-muted hover:text-slate-600"
            title="Sign out"
            aria-label="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-border bg-white px-4 py-2 md:px-6">
          <ContextSwitcher />
        </header>
        <nav aria-label="Main" className="flex gap-1 overflow-x-auto border-b border-border bg-white px-2 py-1 md:hidden">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) =>
                cn(
                  'whitespace-nowrap rounded-md px-3 py-1.5 text-sm text-slate-600',
                  isActive && 'bg-brand-50 font-medium text-brand-700',
                )
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-6xl p-4 md:p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
