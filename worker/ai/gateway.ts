// The model gateway: the only way the platform calls an AI model.
//
// Each call is for one person (the job's requester) and declares the highest
// classification of the content in it. The database decides which provider may
// take it (public.ai_route, db/migrations/00102), every attempt is logged to
// public.ai_calls, and only then does an adapter talk to the provider.
// Prompts and completions are not logged here; callers keep them with their
// own client-scoped rows.

import type { Db, Job, JobContext } from '../queue.ts'

export type Classification = 'public' | 'internal' | 'confidential' | 'client_confidential' | 'controlled' | 'export_controlled'

export type ProviderRow = {
  id: string
  name: string
  kind: string
  config: { model?: string; key_vault_secret?: string; endpoint?: string; effort?: string }
}

export type CompletionRequest = {
  /** What the call is for, e.g. 'provider_test' or 'lesson_draft'. Logged. */
  purpose: string
  /** The highest classification of anything in system or messages. */
  classification: Classification
  /** Null for platform-level work (Global content, provider tests). */
  clientId: string | null
  /** Use this provider instead of the first one allowed. */
  providerId?: string
  system?: string
  messages: { role: 'user' | 'assistant'; content: string }[]
  maxTokens?: number
}

export type Completion = {
  text: string
  model: string
  inputTokens: number
  outputTokens: number
}

export type Adapter = (provider: ProviderRow, request: CompletionRequest) => Promise<Completion>

/** Thrown when policy refuses a call, as opposed to the provider failing. */
export class AiRefusedError extends Error {}

export type Gateway = {
  complete(job: Job, ctx: JobContext, request: CompletionRequest): Promise<Completion & { provider: string }>
}

export function createGateway(db: Db, adapters: Record<string, Adapter>): Gateway {
  return {
    async complete(job, ctx, request) {
      const started = Date.now()
      const record = (providerId: string | null, model: string | null, outcome: string, detail: string | null, done?: Completion) =>
        db.query('select public.record_ai_call($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)', [
          request.clientId, job.id, providerId, job.requested_by, request.purpose, request.classification, model,
          outcome, detail, done?.inputTokens ?? null, done?.outputTokens ?? null, Date.now() - started,
        ])

      let provider: ProviderRow
      try {
        const rows = await ctx.asRequester(async (tx) =>
          (await tx.query<ProviderRow>('select * from public.ai_route($1, $2, $3)', [
            request.clientId, request.classification, request.providerId ?? null,
          ])).rows,
        )
        provider = rows[0]
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        await record(request.providerId ?? null, null, 'refused', message)
        throw new AiRefusedError(message)
      }

      const adapter = adapters[provider.kind]
      if (!adapter) {
        const message = `No adapter for ${provider.kind} providers yet.`
        await record(provider.id, provider.config.model ?? null, 'failed', message)
        throw new Error(message)
      }
      try {
        const done = await adapter(provider, request)
        await record(provider.id, done.model, 'succeeded', null, done)
        return { ...done, provider: provider.name }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        await record(provider.id, provider.config.model ?? null, err instanceof AiRefusedError ? 'refused' : 'failed', message)
        throw err
      }
    },
  }
}
