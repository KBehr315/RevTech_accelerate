import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch, db, unwrap } from '@/lib/db'
import type { TrainingDraft, TrainingOutput, TrainingPiece } from '@/types/domain'

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
