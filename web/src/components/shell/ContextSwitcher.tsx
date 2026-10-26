import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Building2, ChevronDown, Globe, GraduationCap, Settings2 } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { destinations, useSession, type Destination } from '@/hooks/useSession'
import { cn } from '@/lib/utils'
import { contextLabel, useActiveContext, type ActiveContext } from './context'

const KIND_ICON = { client: Building2, global: Globe, platform: Settings2, learn: GraduationCap }

/**
 * Neutral for Global, the client's accent colour (or the brand colour) for a
 * client, so working in the wrong client is hard to miss.
 */
function contextStyle(context: ActiveContext): { className: string; style?: React.CSSProperties } {
  if (context.kind === 'client') {
    const accent = context.workspace?.client.branding.accent_color
    return accent
      ? { className: 'text-white', style: { backgroundColor: accent } }
      : { className: 'bg-brand-700 text-white' }
  }
  if (context.kind === 'global') return { className: 'bg-slate-700 text-white' }
  return { className: 'bg-slate-100 text-slate-800' }
}

export function ContextSwitcher() {
  const context = useActiveContext()
  const { data: session } = useSession()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const options = session ? destinations(session) : []
  const { className, style } = contextStyle(context)
  const Icon = context.kind === 'none' ? Building2 : KIND_ICON[context.kind]

  function open(dest: Destination) {
    // Drop cached data from the previous client before showing another one.
    if (context.kind === 'client' && dest.kind === 'client' && dest.workspace?.client.slug !== context.slug) {
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== 'session' })
    }
    navigate(dest.to)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex max-w-full items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-semibold shadow-card',
            className,
          )}
          style={style}
          aria-label={`${contextLabel(context)}. Switch context`}
        >
          <Icon className="h-4 w-4 shrink-0" aria-hidden />
          <span className="truncate">{contextLabel(context)}</span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        {options.map((dest, i) => {
          const DestIcon = KIND_ICON[dest.kind]
          const previous = options[i - 1]
          return (
            <div key={dest.key}>
              {previous && previous.kind === 'client' && dest.kind !== 'client' && <DropdownMenuSeparator />}
              <DropdownMenuItem onSelect={() => open(dest)}>
                <DestIcon className="mr-2 h-4 w-4 text-slate-500" aria-hidden />
                <span className="truncate">{dest.label}</span>
              </DropdownMenuItem>
            </div>
          )
        })}
        {options.length === 0 && <p className="px-3 py-2 text-sm text-slate-500">No workspaces yet.</p>}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
