import { useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Building2,
  ChevronDown,
  ChevronRight,
  Eye,
  Globe,
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
import { destinations, hasPlatformRole, useSession, type Session } from '@/hooks/useSession'
import { cn, initials } from '@/lib/utils'
import { useActiveContext, type ActiveContext } from './context'
import { ContextSwitcher } from './ContextSwitcher'
import { PreviewBanner } from './PreviewBanner'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
  /** A group that opens and closes in the side menu (`to` is where the group lives). */
  children?: NavItem[]
}

const GLOBAL_NAV: NavItem[] = [
  { to: '/global', label: 'Global home', icon: Globe, end: true },
  { to: '/global/library', label: 'Global Library', icon: Library },
  { to: '/global/client-groups', label: 'Client groups', icon: UsersRound },
]

function navFor(context: ActiveContext, session: Session | undefined): NavItem[] {
  const isPlatformAdmin = hasPlatformRole(session, 'platform_admin')
  // Platform Administrators who also look after RevTech knowledge get both in one menu.
  const globalSection: NavItem[] = hasPlatformRole(session, 'global_knowledge_admin')
    ? [{ to: '/global', label: 'Global knowledge', icon: Globe, children: GLOBAL_NAV }]
    : []
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
      if (!isPlatformAdmin) return GLOBAL_NAV
      return [...platformNav(), ...globalSection]
    case 'platform':
      return [...platformNav(), ...globalSection]
    case 'learn':
      return [{ to: '/learn', label: 'My training', icon: GraduationCap, end: true }]
    default:
      return []
  }
}

function platformNav(): NavItem[] {
  return [
    { to: '/platform', label: 'Overview', icon: Home, end: true },
    { to: '/platform/clients', label: 'Clients', icon: Building2 },
    { to: '/platform/people', label: 'People & roles', icon: Users },
    { to: '/platform/view-as', label: 'View as…', icon: Eye },
    { to: '/platform/ai-providers', label: 'AI providers', icon: Cpu },
    { to: '/platform/audit', label: 'Audit log', icon: FileClock },
    { to: '/platform/settings', label: 'Settings', icon: Settings },
  ]
}

/**
 * Back to the previous screen within the app. Hidden on the first page after
 * signing in: going further back would leave the app (to the Microsoft sign-in).
 * React Router numbers this tab's entries in history.state.idx, from 0, and a
 * redirect that replaces the first page keeps 0.
 */
function BackButton() {
  const navigate = useNavigate()
  useLocation() // re-render on every navigation, so idx is current
  const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0
  if (idx === 0) return null
  return (
    <button
      type="button"
      onClick={() => navigate(-1)}
      className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-medium text-slate-600 hover:bg-surface-muted hover:text-slate-900"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden />
      Back
    </button>
  )
}

const SIDE_LINK =
  'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-surface-muted hover:text-[#0B76A0]'

function SideLink({ link }: { link: NavItem }) {
  return (
    <NavLink to={link.to} end={link.end} className={({ isActive }) => cn(SIDE_LINK, isActive && 'bg-brand-50 text-brand-700')}>
      <link.icon className="h-4 w-4" aria-hidden />
      {link.label}
    </NavLink>
  )
}

/** A menu group that opens and closes; it starts closed. */
function NavGroup({ group }: { group: NavItem }) {
  const { pathname } = useLocation()
  const inside = pathname === group.to || pathname.startsWith(`${group.to}/`)
  const [open, setOpen] = useState(false)
  const Chevron = open ? ChevronDown : ChevronRight
  return (
    <div className="flex flex-col gap-1">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className={cn(SIDE_LINK, inside && 'text-brand-700')}>
        <group.icon className="h-4 w-4" aria-hidden />
        <span className="flex-1 text-left">{group.label}</span>
        <Chevron className="h-4 w-4" aria-hidden />
      </button>
      {open && (
        <div className="ml-4 flex flex-col gap-1 border-l border-border pl-2">
          {group.children!.map((link) => (
            <SideLink key={link.to} link={link} />
          ))}
        </div>
      )}
    </div>
  )
}

export function AppShell() {
  const profile = useAuthStore((s) => s.profile)
  const signOut = useAuthStore((s) => s.signOut)
  const context = useActiveContext()
  const { data: session } = useSession()
  const links = navFor(context, session)
  const hasOtherContexts = (session?.workspaces.length ?? 0) + (session?.platformRoles.length ?? 0) > 1
  // The logo goes to the workspace picker for those who have one (see HomeRedirect), otherwise home.
  const logoTarget =
    session && (destinations(session).length > 1 || hasPlatformRole(session, 'client_creator')) ? '/contexts' : '/'

  return (
    <div className="flex min-h-svh">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-white md:flex">
        <Link
          to={logoTarget}
          className="flex flex-col items-center justify-center gap-1 border-b border-border px-2 py-3 hover:bg-surface-muted"
        >
          <img src="/revtech-logo.png" alt="RevTech, go to the home page" className="h-[72px] w-auto" />
          <span className="text-center font-heading text-sm font-bold uppercase tracking-wide text-brand-900">
            Accelerate
          </span>
        </Link>
        <nav aria-label="Main" className="flex flex-1 flex-col gap-1 p-3">
          {links.map((link) =>
            link.children ? <NavGroup key={link.to} group={link} /> : <SideLink key={link.to} link={link} />,
          )}
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
        <PreviewBanner />
        <header className="flex items-center gap-3 border-b border-border bg-white px-4 py-2 md:px-6">
          <BackButton />
          <div className="ml-auto">
            <ContextSwitcher />
          </div>
        </header>
        <nav aria-label="Main" className="flex gap-1 overflow-x-auto border-b border-border bg-white px-2 py-1 md:hidden">
          {links.flatMap((link) => link.children ?? [link]).map((link) => (
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
