// The generate_training job (db/migrations/00111): reads the ticked documents
// as the requester, asks the model for a draft, checks it, and saves it.

import { AiRefusedError, createGateway, type Adapter, type Classification } from '../ai/gateway.ts'
import type { Db, Handler, JobContext } from '../queue.ts'
import { buildPrompt, DRAFT_SCHEMA, finalize, SYSTEM_PROMPT, type Draft, type Source, type Video } from './draft.ts'

type Target = {
  id: string
  client_id: string
  brief: string
  outputs: string[]
  pieces: string[]
  asset_ids: string[]
  videos: Video[]
  classification: Classification
}

/** How long to wait for newly uploaded documents to be read before writing without them. */
// Kept well under the queue's 15-minute lock, so a slow draft isn't claimed twice.
const READ_WAIT_MS = 5 * 60_000
const POLL_MS = 10_000
const MAX_PICTURE_BYTES = 5 * 1024 * 1024
const MAX_PICTURES = 10

export function generateTraining({
  adapters,
  readBlob,
  pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}: {
  adapters: Record<string, Adapter>
  readBlob: (blobPath: string) => Promise<Buffer>
  pause?: (ms: number) => Promise<void>
}): Handler {
  return async (job, ctx) => {
    const { db } = ctx
    const draftId = String(job.payload.draft_id)
    const [target] = (await db.query<Target>('select * from public.training_draft_to_write($1)', [draftId])).rows
    if (!target) return { skipped: 'The draft no longer exists.' }
    const save = (status: string, detail: string, extra: { title?: string; content?: Draft; model?: string } = {}) =>
      db.query('select public.save_training_draft($1, $2, $3, $4, $5, $6)', [
        draftId, status, detail, extra.title ?? null, extra.content ? JSON.stringify(extra.content) : null, extra.model ?? null,
      ])

    try {
      await save('generating', target.asset_ids.length ? 'Reading your documents…' : 'Writing the draft…')
      const { sources, unread } = await loadSources(ctx, target.asset_ids, readBlob, pause)
      if (target.asset_ids.length) await save('generating', 'Writing the draft…')

      const prompt = buildPrompt(target, sources, target.videos)
      const pictures = sources.flatMap((s) => (s.image ? [s.image] : []))
      const done = await createGateway(db, adapters).complete(job, ctx, {
        purpose: 'training_draft',
        classification: target.classification,
        clientId: target.client_id,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt.text }],
        attachments: pictures,
        jsonSchema: DRAFT_SCHEMA,
        maxTokens: 64_000,
      })

      const draft = finalize(JSON.parse(done.text) as Draft, sources, target.videos, prompt.truncated)
      if (unread.length) draft.review_notes.unshift(`Not yet read when the draft was written, so not used: ${unread.join(', ')}.`)
      const used = sources.length ? `from ${sources.length} document${sources.length === 1 ? '' : 's'}` : 'without library documents'
      const checks = draft.review_notes.length
      await save('ready', `Written by ${done.model} ${used}. ${checks ? `${checks} thing${checks === 1 ? '' : 's'} to check.` : 'Nothing flagged.'}`, {
        title: draft.title,
        content: draft,
        model: done.model,
      })
      return { model: done.model, sections: draft.sections.length, questions: draft.quiz.length, notes: checks }
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      // A refusal or an unreadable answer won't change on a second try.
      const final = err instanceof AiRefusedError || err instanceof SyntaxError || job.attempts >= job.max_attempts
      await save(final ? 'failed' : 'queued', final ? reason : `Trying again: ${reason}`)
      if (final) return { failed: reason }
      throw err
    }
  }
}

type Row = { asset_id: string; title: string; version_id: string; extraction_status: string; filename: string | null; blob_path: string | null; bytes: number | null }

/**
 * The ticked documents as the requester can read them (RLS applies), in the
 * order ticked. Waits a while for any still being read; those still unread
 * after that are left out and named.
 */
async function loadSources(
  ctx: JobContext,
  assetIds: string[],
  readBlob: (blobPath: string) => Promise<Buffer>,
  pause: (ms: number) => Promise<void>,
): Promise<{ sources: Source[]; unread: string[] }> {
  if (!assetIds.length) return { sources: [], unread: [] }
  const read = (tx: Db) =>
    tx.query<Row>(
      `select a.id as asset_id, a.title, v.id as version_id, v.extraction_status, f.filename, f.blob_path, f.bytes
       from public.knowledge_assets a
       join public.knowledge_asset_versions v on v.id = a.current_version_id
       left join public.source_files f on f.id = v.source_file_id
       where a.id = any($1) and a.lifecycle_status <> 'archived'`,
      [assetIds],
    )

  let rows: Row[] = []
  for (let waited = 0; ; waited += POLL_MS) {
    rows = (await ctx.asRequester(read)).rows
    if (!rows.some((r) => ['pending', 'running'].includes(r.extraction_status)) || waited >= READ_WAIT_MS) break
    await pause(POLL_MS)
  }

  const ready = rows.filter((r) => !['pending', 'running'].includes(r.extraction_status))
  const passages = await ctx.asRequester(async (tx) =>
    (await tx.query<{ asset_version_id: string; text: string }>(
      'select asset_version_id, text from public.source_chunks where asset_version_id = any($1) order by ordinal',
      [ready.map((r) => r.version_id)],
    )).rows,
  )

  const sources: Source[] = []
  let pictures = 0
  for (const id of assetIds) {
    const row = ready.find((r) => r.asset_id === id)
    if (!row) continue
    const source: Source = {
      asset_id: id,
      title: row.title,
      passages: passages.filter((p) => p.asset_version_id === row.version_id).map((p) => p.text),
    }
    const ext = row.filename?.split('.').pop()?.toLowerCase()
    if (row.blob_path && (ext === 'png' || ext === 'jpg' || ext === 'jpeg') && (row.bytes ?? 0) <= MAX_PICTURE_BYTES && pictures < MAX_PICTURES) {
      source.image = { mediaType: ext === 'png' ? 'image/png' : 'image/jpeg', data: await readBlob(row.blob_path) }
      pictures++
    }
    sources.push(source)
  }
  const unread = rows.filter((r) => !ready.includes(r)).map((r) => r.title)
  return { sources, unread }
}
