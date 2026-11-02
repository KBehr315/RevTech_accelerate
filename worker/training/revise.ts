// The revise_training job (db/migrations/00112): Claude rewrites one piece of a
// draft from a reviewer's instruction, as the reviewer, with the same documents
// the draft was written from, numbered as they were then.

import { AiRefusedError, createGateway, type Adapter, type Classification } from '../ai/gateway.ts'
import type { Handler } from '../queue.ts'
import { buildRevisionPrompt, findPart, finalizeRevision, revisionSchema, SYSTEM_PROMPT, type Draft, type Part, type Source, type Video } from './draft.ts'
import { loadSources } from './generate.ts'

type Target = {
  revision_id: string
  draft_id: string
  part_id: string
  instruction: string
  content: Draft
  client_id: string
  brief: string
  pieces: string[]
  videos: Video[]
  classification: Classification
  client_name: string
  other_clients: string[]
}

export function reviseTraining({ adapters, readBlob }: { adapters: Record<string, Adapter>; readBlob: (blobPath: string) => Promise<Buffer> }): Handler {
  return async (job, ctx) => {
    const { db } = ctx
    const revisionId = String(job.payload.revision_id)
    const [target] = (await db.query<Target>('select * from public.training_revision_to_write($1)', [revisionId])).rows
    if (!target) return { skipped: 'The revision no longer exists.' }
    const save = (status: string, detail: string, part: Part | null = null, notes: string[] = []) =>
      db.query('select public.save_training_revision($1, $2, $3, $4, $5)', [
        revisionId, status, detail, part ? JSON.stringify(part) : null, notes,
      ])

    const found = findPart(target.content, target.part_id)
    if (!found) {
      await save('failed', 'The piece is no longer in the draft.')
      return { failed: 'The piece is no longer in the draft.' }
    }

    try {
      await save('running', 'Claude is rewriting this…')
      const known = target.content.sources ?? []
      // Already read when the draft was written, so no waiting.
      const { sources: loaded } = await loadSources(ctx, known.map((s) => s.asset_id), readBlob, async () => {}, 0)
      const sources: Source[] = known.map((s) => loaded.find((l) => l.asset_id === s.asset_id) ?? { asset_id: s.asset_id, title: s.title, passages: [] })
      const client = { name: target.client_name, otherClients: target.other_clients }

      const done = await createGateway(db, adapters).complete(job, ctx, {
        purpose: 'training_revision',
        classification: target.classification,
        clientId: target.client_id,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildRevisionPrompt(target.content, found, target.instruction, target, client, sources) }],
        attachments: sources.flatMap((s) => (s.image ? [s.image] : [])),
        jsonSchema: revisionSchema(found.kind),
        maxTokens: 16_000,
      })

      const result = finalizeRevision(JSON.parse(done.text), found, target.content, client, sources, target.videos)
      if ('error' in result) {
        await save('failed', result.error)
        return { failed: result.error }
      }
      await save('done', `Rewritten by ${done.model}. Check it again.`, result.part, result.notes)
      return { model: done.model, kind: found.kind, notes: result.notes.length }
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
