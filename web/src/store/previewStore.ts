import { create } from 'zustand'
import type { Client, ClientRole } from '@/types/domain'

/**
 * "View as" (db/migrations/00110): a Platform Administrator previewing one
 * client role. While set, every request carries X-View-As, the database treats
 * the caller as that role in that client, and the API server allows reads only.
 * Kept for this tab only, so a preview never outlives the window it started in.
 */
export type Preview = { client: Pick<Client, 'id' | 'name' | 'slug'>; role: ClientRole }

const KEY = 'accelerate.preview'

function load(): Preview | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Preview) : null
  } catch {
    return null
  }
}

interface PreviewState {
  preview: Preview | null
  start: (preview: Preview) => void
  stop: () => void
}

export const usePreviewStore = create<PreviewState>((set) => ({
  preview: load(),
  start: (preview) => {
    try {
      sessionStorage.setItem(KEY, JSON.stringify(preview))
    } catch {
      // Without storage the preview still works until the page reloads.
    }
    set({ preview })
  },
  stop: () => {
    try {
      sessionStorage.removeItem(KEY)
    } catch {
      // Nothing stored.
    }
    set({ preview: null })
  },
}))

/** The X-View-As header value for the current preview, if any. */
export function viewAsHeader(): string | null {
  const preview = usePreviewStore.getState().preview
  return preview ? `${preview.client.id}:${preview.role}` : null
}
