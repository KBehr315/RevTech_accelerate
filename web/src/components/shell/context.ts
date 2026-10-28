import { useMatch } from 'react-router-dom'
import { useSession, type Workspace } from '@/hooks/useSession'

export type ActiveContext =
  | { kind: 'client'; slug: string; workspace: Workspace | undefined }
  | { kind: 'global' }
  | { kind: 'platform' }
  | { kind: 'learn' }
  | { kind: 'none' }

/**
 * The operating context comes from the URL (/c/:slug, /global, /platform, /learn),
 * so links and reloads keep it. It decides navigation and the context banner;
 * it grants nothing - the database checks membership on every request.
 */
export function useActiveContext(): ActiveContext {
  const client = useMatch('/c/:slug/*')
  const global = useMatch('/global/*')
  const platform = useMatch('/platform/*')
  const learn = useMatch('/learn/*')
  const { data: session } = useSession()

  if (client) {
    const slug = client.params.slug!
    return { kind: 'client', slug, workspace: session?.workspaces.find((w) => w.client.slug === slug) }
  }
  if (global) return { kind: 'global' }
  if (platform) return { kind: 'platform' }
  if (learn) return { kind: 'learn' }
  return { kind: 'none' }
}

/** Text of the always-visible context indicator (master prompt §4). */
export function contextLabel(context: ActiveContext): string {
  switch (context.kind) {
    case 'client':
      return `Client Context: ${context.workspace?.client.name ?? context.slug}`
    case 'global':
      return 'Global Context'
    case 'platform':
      return 'Platform administration'
    case 'learn':
      return 'My training'
    default:
      return 'Choose a context'
  }
}
