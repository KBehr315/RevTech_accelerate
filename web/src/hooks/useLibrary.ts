import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch, db, unwrap } from '@/lib/db'
import type { KnowledgeAsset } from '@/types/domain'

const LIBRARY_SELECT = `*,
  current:knowledge_asset_versions!knowledge_assets_current_version_id_fkey(
    version_no, extraction_status, extraction_detail,
    file:source_files!knowledge_asset_versions_source_file_id_fkey(id, filename, bytes, scan_status)
  ),
  uploader:profiles!knowledge_assets_created_by_fkey(full_name)`

/** A client's library, newest first, as far as RLS lets the caller see it. */
export function useClientAssets(clientId: string) {
  return useQuery({
    queryKey: ['library', clientId],
    queryFn: async () =>
      unwrap(
        await db
          .from('knowledge_assets')
          .select(LIBRARY_SELECT)
          .eq('client_id', clientId)
          .order('created_at', { ascending: false }),
      ),
    // Scanning and reading finish in the background; refresh while any is still going.
    refetchInterval: (query) =>
      query.state.data?.some(
        (a) =>
          a.current?.file?.scan_status === 'pending' ||
          ['pending', 'running'].includes(a.current?.extraction_status ?? ''),
      )
        ? 5_000
        : false,
  })
}

export type LibraryAsset = NonNullable<ReturnType<typeof useClientAssets>['data']>[number]

async function messageFrom(res: Response): Promise<string> {
  const body = await res.json().catch(() => null)
  return body?.message || `The request failed (${res.status}).`
}

/** Uploads one file to a client's library (PUT /api/upload, server/files.ts). */
export function useUpload(clientId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (file: File): Promise<KnowledgeAsset> => {
      const params = new URLSearchParams({ filename: file.name, client_id: clientId })
      const res = await apiFetch(`/api/upload?${params}`, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        body: file,
      })
      if (!res.ok) throw new Error(await messageFrom(res))
      return res.json()
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['library', clientId] }),
  })
}

/** Keyword search over the library (search_library in db/migrations/00104). */
export function useLibrarySearch(clientId: string, query: string) {
  return useQuery({
    queryKey: ['library-search', clientId, query],
    enabled: query.trim().length > 1,
    queryFn: async () => unwrap(await db.rpc('search_library', { p_client_id: clientId, p_query: query })),
    staleTime: 30_000,
  })
}

async function fetchFile(fileId: string): Promise<Blob> {
  const res = await apiFetch(`/api/files/${fileId}`)
  if (!res.ok) throw new Error(await messageFrom(res))
  return res.blob()
}

/** Downloads a file through the API server (GET /api/files/:id) and saves it. */
export async function downloadFile(fileId: string, filename: string) {
  const url = URL.createObjectURL(await fetchFile(fileId))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

/**
 * Opens a PDF in a new tab at a page (the browser's viewer reads #page=).
 * The tab is opened first, so the browser doesn't treat it as a pop-up.
 */
export async function openPdfAtPage(fileId: string, page: number) {
  const tab = window.open('', '_blank')
  try {
    const blob = new Blob([await fetchFile(fileId)], { type: 'application/pdf' })
    const url = URL.createObjectURL(blob)
    if (tab) tab.location.href = `${url}#page=${page}`
    // The tab keeps its own reference; release ours once it has loaded.
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  } catch (err) {
    tab?.close()
    throw err
  }
}
