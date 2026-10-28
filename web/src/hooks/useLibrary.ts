import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch, db, unwrap } from '@/lib/db'
import type { KnowledgeAsset } from '@/types/domain'

const LIBRARY_SELECT = `*,
  current:knowledge_asset_versions!knowledge_assets_current_version_id_fkey(
    version_no, extraction_status,
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
    // Scans finish in the background; refresh while any is still running.
    refetchInterval: (query) =>
      query.state.data?.some((a) => a.current?.file?.scan_status === 'pending') ? 5_000 : false,
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

/** Downloads a file through the API server (GET /api/files/:id) and saves it. */
export async function downloadFile(fileId: string, filename: string) {
  const res = await apiFetch(`/api/files/${fileId}`)
  if (!res.ok) throw new Error(await messageFrom(res))
  const url = URL.createObjectURL(await res.blob())
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
