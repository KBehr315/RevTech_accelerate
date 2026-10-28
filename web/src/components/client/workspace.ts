import { useOutletContext } from 'react-router-dom'
import type { Workspace } from '@/hooks/useSession'

/** The workspace ClientLayout resolved from /c/:slug, for pages beneath it. */
export function useWorkspace(): Workspace {
  return useOutletContext<Workspace>()
}
