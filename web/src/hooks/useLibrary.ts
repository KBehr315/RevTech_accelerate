import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch, db, unwrap } from '@/lib/db'
import type { KnowledgeAsset, KnowledgeScope } from '@/types/domain'

const LIBRARY_SELECT = `*,
  current:knowledge_asset_versions!knowledge_assets_current_version_id_fkey(
    version_no, extraction_status, extraction_detail,
    file:source_files!knowledge_asset_versions_source_file_id_fkey(id, filename, bytes, scan_status)
  ),
  uploader:profiles!knowledge_assets_created_by_fkey(full_name),
  audiences:asset_audiences(client:clients(id, name), client_group:client_groups(id, name)),
  suggestions:duplicate_candidates!duplicate_candidates_asset_id_fkey(
    id, same_name, text_similarity, status,
    existing:knowledge_assets!duplicate_candidates_existing_asset_id_fkey(id, title)
  )`

type Filter = { clientId: string } | { sharedWith: string } | { scope: Exclude<KnowledgeScope, 'client'> }

const keyOf = (filter: Filter) => ['library', filter]

/**
 * One bucket of the library, newest first, as far as RLS lets the caller see it:
 * a client's own documents, those shared with a client, or a bucket outside any client.
 */
export function useAssets(filter: Filter, enabled = true) {
  return useQuery({
    queryKey: keyOf(filter),
    enabled,
    queryFn: async () => {
      const query =
        'sharedWith' in filter
          ? db.rpc('client_shared_assets', { p_client_id: filter.sharedWith }).select(LIBRARY_SELECT)
          : 'clientId' in filter
            ? db.from('knowledge_assets').select(LIBRARY_SELECT).eq('client_id', filter.clientId)
            : db.from('knowledge_assets').select(LIBRARY_SELECT).eq('scope', filter.scope)
      // Archived documents (for now, removed duplicates) stay out of the library.
      return unwrap(await query.neq('lifecycle_status', 'archived').order('created_at', { ascending: false }))
    },
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

export type LibraryAsset = NonNullable<ReturnType<typeof useAssets>['data']>[number]

/** Where copies of these client documents went (asset_copies, 00106), keyed by original. */
export function useAssetCopies(assetIds: string[], enabled: boolean) {
  return useQuery({
    queryKey: ['library-copies', assetIds],
    enabled: enabled && assetIds.length > 0,
    queryFn: async () => {
      const rows = unwrap(await db.rpc('asset_copies', { p_asset_ids: assetIds })) as {
        copied_from_asset_id: string
        scope: KnowledgeScope
      }[]
      const copies = new Map<string, KnowledgeScope[]>()
      for (const row of rows) copies.set(row.copied_from_asset_id, [...(copies.get(row.copied_from_asset_id) ?? []), row.scope])
      return copies
    },
  })
}

async function messageFrom(res: Response): Promise<string> {
  const body = await res.json().catch(() => null)
  return body?.message || `The request failed (${res.status}).`
}

/** PUT /api/upload (server/files.ts) with the file as the body. */
async function putFile(file: File, params: Record<string, string | null>): Promise<KnowledgeAsset> {
  const query = new URLSearchParams({ filename: file.name })
  for (const [key, value] of Object.entries(params)) if (value) query.set(key, value)
  const res = await apiFetch(`/api/upload?${query}`, {
    method: 'PUT',
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  })
  if (!res.ok) throw new Error(await messageFrom(res))
  return res.json()
}

/** Uploads one file: to a client's library, or with no client to Pending Classification. */
export function useUpload(clientId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (file: File) => putFile(file, { client_id: clientId }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['library'] }),
  })
}

/** Uploads a file as the next version of a document, with a note of what changed (00108). */
export function useUploadVersion() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ assetId, file, note }: { assetId: string; file: File; note: string }) =>
      putFile(file, { asset_id: assetId, note: note.trim() || null }),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['library'] })
      void queryClient.invalidateQueries({ queryKey: ['library-versions'] })
    },
  })
}

/** Every version of a document, newest first. */
export function useAssetVersions(assetId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['library-versions', assetId],
    enabled,
    queryFn: async () =>
      unwrap(
        await db
          .from('knowledge_asset_versions')
          .select(
            `id, version_no, change_note, created_at, extraction_status,
            file:source_files!knowledge_asset_versions_source_file_id_fkey(id, filename, bytes, scan_status),
            author:profiles!knowledge_asset_versions_created_by_fkey(full_name)`,
          )
          .eq('asset_id', assetId)
          .order('version_no', { ascending: false }),
      ),
  })
}

/** Answers a "looks like a newer version" suggestion (resolve_duplicate, 00108). */
export function useResolveDuplicate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, action }: { id: string; action: 'new_version' | 'separate' | 'remove' }) =>
      unwrap(await db.rpc('resolve_duplicate', { p_candidate_id: id, p_action: action })),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['library'] })
      void queryClient.invalidateQueries({ queryKey: ['library-search'] })
      void queryClient.invalidateQueries({ queryKey: ['library-versions'] })
    },
  })
}

export type Placement = { scope: KnowledgeScope; clientIds?: string[]; groupIds?: string[] }

/**
 * Moves a document that belongs to no client into another bucket (place_asset),
 * or copies a client's document out of it (copy_asset). Both in 00106.
 */
export function usePlaceAsset() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ asset, to }: { asset: Pick<KnowledgeAsset, 'id' | 'client_id'>; to: Placement }) =>
      unwrap(
        await db.rpc(asset.client_id ? 'copy_asset' : 'place_asset', {
          p_asset_id: asset.id,
          p_scope: to.scope,
          p_client_ids: to.clientIds ?? [],
          p_group_ids: to.groupIds ?? [],
        }),
      ),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['library'] })
      void queryClient.invalidateQueries({ queryKey: ['library-copies'] })
      void queryClient.invalidateQueries({ queryKey: ['library-search'] })
    },
  })
}

/** Queues a document's file to be read again (request_extraction, 00107). */
export function useReadAgain() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (assetId: string) => unwrap(await db.rpc('request_extraction', { p_asset_id: assetId })),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['library'] }),
  })
}

/** Clients and client groups a document can be shared with (Global Knowledge Administrators see all). */
export function useAudienceChoices(enabled: boolean) {
  return useQuery({
    queryKey: ['library-audiences'],
    enabled,
    queryFn: async () => {
      const [clients, groups] = await Promise.all([
        db.from('clients').select('id, name').neq('status', 'archived').order('name'),
        db.from('client_groups').select('id, name').order('name'),
      ])
      return { clients: unwrap(clients), groups: unwrap(groups) }
    },
  })
}

/** Keyword search over the library (search_library in db/migrations/00106). Null client = Global context. */
export function useLibrarySearch(clientId: string | null, query: string) {
  return useQuery({
    queryKey: ['library-search', clientId, query],
    enabled: query.trim().length > 1,
    queryFn: async () =>
      unwrap(await db.rpc('search_library', { p_client_id: clientId, p_query: query, p_limit: 150 })),
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
