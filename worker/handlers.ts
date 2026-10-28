// One handler per job kind. Each phase of the roadmap adds its own here
// (source extraction, generation, rendering, reminders, …).

import { anthropicAdapter } from './ai/anthropic.ts'
import { createGateway, type Adapter } from './ai/gateway.ts'
import type { Handler } from './queue.ts'

/** Provider kinds the gateway can call. Bedrock and Azure OpenAI come when needed. */
export const adapters: Record<string, Adapter> = { anthropic: anthropicAdapter }

export function makeHandlers(providerAdapters: Record<string, Adapter>): Record<string, Handler> {
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
      const done = await createGateway(ctx.db, providerAdapters).complete(job, ctx, {
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
  }
}

export const handlers = makeHandlers(adapters)
