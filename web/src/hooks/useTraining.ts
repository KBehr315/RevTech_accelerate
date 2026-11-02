import { useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch, db, unwrap } from '@/lib/db'
import type { TrainingDraft, TrainingOutput, TrainingPiece, TrainingRevision } from '@/types/domain'

const stillWriting = (draft: Pick<TrainingDraft, 'status'>) => draft.status === 'queued' || draft.status === 'generating'

/** A client's training drafts, newest first: all of them for its Training Administrators, your own otherwise (00111). */
export function useTrainingDrafts(clientId: string) {
  return useQuery({
    queryKey: ['training-drafts', clientId],
    queryFn: async () =>
      unwrap(
        await db
          .from('training_drafts')
          .select('id, title, outputs, status, status_detail, created_at, author:profiles!training_drafts_created_by_fkey(full_name)')
          .eq('client_id', clientId)
          .order('created_at', { ascending: false }),
      ),
    refetchInterval: (query) => (query.state.data?.some(stillWriting) ? 5_000 : false),
  })
}

/** One draft, refreshed while Claude is still writing it. */
export function useTrainingDraft(id: string) {
  return useQuery({
    queryKey: ['training-draft', id],
    queryFn: async () => unwrap(await db.from('training_drafts').select('*').eq('id', id).single()),
    refetchInterval: (query) => (query.state.data && stillWriting(query.state.data) ? 4_000 : false),
  })
}

export type DraftRequest = {
  clientId: string
  brief: string
  outputs: TrainingOutput[]
  pieces: TrainingPiece[]
  assetIds: string[]
  videos: { url: string; note: string }[]
}

/** Queues a draft for Claude to write (start_training_draft, 00111). */
export function useStartTrainingDraft() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (request: DraftRequest) =>
      unwrap(
        await db.rpc('start_training_draft', {
          p_client_id: request.clientId,
          p_brief: request.brief,
          p_outputs: request.outputs,
          p_pieces: request.pieces,
          p_asset_ids: request.assetIds,
          p_videos: request.videos,
        }),
      ),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['training-drafts'] }),
  })
}

/** Downloads a finished draft's slides as a PowerPoint file (GET /api/training/:id/slides.pptx, server/training.ts). */
export function useDownloadSlides() {
  return useMutation({
    mutationFn: async ({ id, title }: { id: string; title: string }) => {
      const res = await apiFetch(`/api/training/${id}/slides.pptx`)
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.message || `The download failed (${res.status}).`)
      const url = URL.createObjectURL(await res.blob())
      const link = document.createElement('a')
      link.href = url
      link.download = `${title.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'Training'}.pptx`
      link.click()
      URL.revokeObjectURL(url)
    },
  })
}

/** Which pieces of a draft have been ticked as checked, and by whom (00112). */
export function useTrainingReviews(draftId: string) {
  return useQuery({
    queryKey: ['training-reviews', draftId],
    queryFn: async () =>
      unwrap(
        await db
          .from('training_reviews')
          .select('part_id, checked_at, checker:profiles!training_reviews_checked_by_fkey(full_name)')
          .eq('draft_id', draftId),
      ),
  })
}

const stillRevising = (r: Pick<TrainingRevision, 'status'>) => r.status === 'queued' || r.status === 'running'

/**
 * Claude's rewrites of a draft's pieces, newest first, refreshed while one is
 * running. When one finishes, the draft and its checks are read again.
 */
export function useTrainingRevisions(draftId: string) {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: ['training-revisions', draftId],
    queryFn: async () =>
      unwrap(
        await db
          .from('training_revisions')
          .select('*')
          .eq('draft_id', draftId)
          .order('created_at', { ascending: false }),
      ),
    refetchInterval: (q) => (q.state.data?.some(stillRevising) ? 4_000 : false),
  })
  const running = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (!query.data) return
    const now = new Set(query.data.filter(stillRevising).map((r) => r.id))
    if ([...running.current].some((id) => !now.has(id))) {
      queryClient.invalidateQueries({ queryKey: ['training-draft', draftId] })
      queryClient.invalidateQueries({ queryKey: ['training-reviews', draftId] })
    }
    running.current = now
  }, [query.data, draftId, queryClient])
  return query
}

/** Ticks or unticks a piece as checked. */
export function useCheckTrainingPart(draftId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ partId, checked }: { partId: string; checked: boolean }) =>
      unwrap(await db.rpc('check_training_part', { p_draft_id: draftId, p_part_id: partId, p_checked: checked })),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['training-reviews', draftId] }),
  })
}

/** Saves a reviewer's own wording for a piece; it then counts as checked by them. */
export function useEditTrainingPart(draftId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ partId, part }: { partId: string; part: Record<string, unknown> }) =>
      unwrap(await db.rpc('edit_training_part', { p_draft_id: draftId, p_part_id: partId, p_part: part })),
    onSuccess: (draft) => queryClient.setQueryData(['training-draft', draftId], draft),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['training-reviews', draftId] }),
  })
}

/** Asks Claude to rewrite a piece from an instruction. */
export function useReviseTrainingPart(draftId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ partId, instruction }: { partId: string; instruction: string }) =>
      unwrap(await db.rpc('revise_training_part', { p_draft_id: draftId, p_part_id: partId, p_instruction: instruction })),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['training-revisions', draftId] }),
  })
}
