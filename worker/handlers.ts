// One handler per job kind. Each phase of the roadmap adds its own here
// (source extraction, generation, rendering, reminders, …).

import { defenderVerdict, readBlob } from '../server/storage.ts'
import { anthropicAdapter } from './ai/anthropic.ts'
import { AiRefusedError, createGateway, type Adapter, type Classification } from './ai/gateway.ts'
import { extract, type Chunk } from './extract/index.ts'
import { ocrImage, ocrPdfPages, type Complete } from './extract/ocr.ts'
import type { Handler } from './queue.ts'

/** What handlers reach outside the database, replaced by stand-ins in tests. */
export type Deps = {
  /** Provider kinds the gateway can call. Bedrock and Azure OpenAI come when needed. */
  adapters: Record<string, Adapter>
  /** Defender for Storage's verdict on a blob, or null while there is none (server/storage.ts). */
  scanVerdict: (blobPath: string) => Promise<'clean' | 'infected' | 'failed' | null>
  /** A stored file's bytes (server/storage.ts). */
  readBlob: (blobPath: string) => Promise<Buffer>
}

export const deps: Deps = { adapters: { anthropic: anthropicAdapter }, scanVerdict: defenderVerdict, readBlob }

export function makeHandlers({ adapters, scanVerdict, readBlob }: Deps): Record<string, Handler> {
  return {
    /** Confirms the worker can reach the database and act as the requester. */
    health_check: async (job, { asRequester, workerId }) => {
      const [row] = await asRequester(async (tx) =>
        (await tx.query<{ now: string; is_admin: boolean }>('select now() as now, public.is_platform_admin() as is_admin')).rows,
      )
      return {
        worker: workerId,
        database_time: row.now,
        acted_as_requester: row.is_admin,
        node: process.version,
      }
    },

    /** One short request to a provider, to check its key and model (request_ai_provider_test). */
    ai_provider_test: async (job, ctx) => {
      const done = await createGateway(ctx.db, adapters).complete(job, ctx, {
        purpose: 'provider_test',
        classification: 'public',
        clientId: null,
        providerId: String(job.payload.provider_id),
        messages: [{ role: 'user', content: 'Reply with one short sentence confirming you can read this.' }],
        maxTokens: 4_000,
      })
      return {
        provider: done.provider,
        model: done.model,
        reply: done.text.slice(0, 500),
        input_tokens: done.inputTokens,
        output_tokens: done.outputTokens,
      }
    },

    /**
     * Records a new upload's malware scan (complete_upload queues this). With
     * scanning off (preview only) the file is marked not_scanned. Otherwise it
     * waits for Defender's verdict: a missing verdict fails the attempt, and the
     * queue retries with backoff (10 attempts, about 8 hours).
     */
    scan_file: async (job, { db }) => {
      const fileId = String(job.payload.file_id)
      const [target] = (await db.query<{ blob_path: string; scanning: string }>('select * from public.file_to_scan($1)', [fileId])).rows
      if (!target) return { skipped: 'The file no longer exists.' }

      const result = target.scanning === 'off' ? 'not_scanned' : await scanVerdict(target.blob_path)
      if (!result) throw new Error('No malware scan result yet. Is Defender for Storage enabled on the storage account?')
      await db.query('select public.record_scan_result($1, $2)', [fileId, result])
      return { result }
    },

    /**
     * Reads a version's file into searchable chunks (worker/extract/). Queued
     * once the scan allows it. Pages with no text layer (images, scanned PDF
     * pages) are transcribed by an AI model through the gateway, as the
     * uploader. A file that can't be parsed, or that the gateway refuses to
     * send, is recorded with the reason rather than retried; other errors are
     * retried, and recorded as failed on the last attempt.
     */
    extract_version: async (job, ctx) => {
      const { db } = ctx
      const versionId = String(job.payload.version_id)
      const [target] = (
        await db.query<{
          blob_path: string
          filename: string
          scan_status: string
          client_id: string | null
          security_classification: Classification
        }>('select * from public.version_to_extract($1)', [versionId])
      ).rows
      if (!target) return { skipped: 'The version or its file no longer exists.' }
      if (!['clean', 'not_scanned'].includes(target.scan_status)) return { skipped: `Scan status is ${target.scan_status}.` }

      const status = (value: string, detail: string | null = null) =>
        db.query('select public.set_extraction_status($1, $2, $3)', [versionId, value, detail])
      await status('running')
      try {
        const buffer = await readBlob(target.blob_path)
        let result
        try {
          result = await extract(buffer, target.filename)
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err)
          await status('failed', reason)
          return { failed: reason }
        }

        let { status: outcome, chunks, detail } = result
        const ext = target.filename.split('.').pop()?.toLowerCase()
        const isImage = ext === 'png' || ext === 'jpg' || ext === 'jpeg'
        const imagePages = result.imagePages ?? []
        if (isImage || imagePages.length) {
          const gateway = createGateway(db, adapters)
          const complete: Complete = (request) =>
            gateway.complete(job, ctx, {
              ...request,
              purpose: 'ocr',
              classification: target.security_classification,
              clientId: target.client_id,
            })
          try {
            const read: Chunk[] = isImage
              ? await ocrImage(complete, buffer, ext === 'png' ? 'image/png' : 'image/jpeg')
              : await ocrPdfPages(complete, buffer, imagePages)
            const textPages = new Set(chunks.map((c) => c.locator.page)).size
            // Text pages and transcribed pages together, in page order.
            chunks = [...chunks, ...read].sort((a, b) => Number(a.locator.page ?? 0) - Number(b.locator.page ?? 0))
            outcome = 'done'
            const scanned = `${imagePages.length} scanned page${imagePages.length === 1 ? '' : 's'} read by AI.`
            detail = isImage
              ? 'Text read from the image by AI.'
              : textPages
                ? `Read ${textPages} page${textPages === 1 ? '' : 's'}; ${scanned}`
                : scanned
          } catch (err) {
            if (!(err instanceof AiRefusedError)) throw err
            detail = `${detail} The scanned parts weren't read: ${err.message}`
          }
        }

        const [{ saved }] = (
          await db.query<{ saved: number }>('select public.save_extraction($1, $2, $3, $4) as saved', [
            versionId,
            outcome,
            detail,
            JSON.stringify(chunks),
          ])
        ).rows
        return { status: outcome, chunks: saved, detail }
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err)
        await status(job.attempts >= job.max_attempts ? 'failed' : 'pending', reason)
        throw err
      }
    },
  }
}

export const handlers = makeHandlers(deps)
