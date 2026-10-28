// One handler per job kind. Each phase of the roadmap adds its own here
// (source extraction, generation, rendering, reminders, …).

import { defenderVerdict } from '../server/storage.ts'
import { anthropicAdapter } from './ai/anthropic.ts'
import { createGateway, type Adapter } from './ai/gateway.ts'
import type { Handler } from './queue.ts'

/** What handlers reach outside the database, replaced by stand-ins in tests. */
export type Deps = {
  /** Provider kinds the gateway can call. Bedrock and Azure OpenAI come when needed. */
  adapters: Record<string, Adapter>
  /** Defender for Storage's verdict on a blob, or null while there is none (server/storage.ts). */
  scanVerdict: (blobPath: string) => Promise<'clean' | 'infected' | 'failed' | null>
}

export const deps: Deps = { adapters: { anthropic: anthropicAdapter }, scanVerdict: defenderVerdict }

export function makeHandlers({ adapters, scanVerdict }: Deps): Record<string, Handler> {
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
  }
}

export const handlers = makeHandlers(deps)
