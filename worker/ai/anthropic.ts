// Adapter for the Anthropic API (provider kind 'anthropic').
//
// Provider config: { model, key_vault_secret, effort? }. Defaults to Claude
// Opus 5.5 at high effort. Requests stream, so long generations don't hit HTTP
// timeouts. On the models that support it, a safety decline is retried on a
// suitable model by the API itself (server-side fallback, routed by category);
// the model that answered is what gets logged.

import Anthropic from '@anthropic-ai/sdk'
import { AiRefusedError, type Adapter, type CompletionRequest } from './gateway.ts'
import { getSecret } from './secrets.ts'

const DEFAULT_MODEL = 'claude-opus-5-5'
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const
const SUPPORTS_DEFAULT_FALLBACK = new Set(['claude-fable-5-1', 'claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5'])

/** The request's messages, with any attachments placed before the text of the last user message. */
function withAttachments(request: CompletionRequest): Anthropic.Beta.BetaMessageParam[] {
  const messages: Anthropic.Beta.BetaMessageParam[] = request.messages.map((m) => ({ role: m.role, content: m.content }))
  const last = messages[messages.length - 1]
  if (!request.attachments?.length || last?.role !== 'user') return messages
  const files: Anthropic.Beta.BetaContentBlockParam[] = request.attachments.map((a) =>
    a.mediaType === 'application/pdf'
      ? { type: 'document', source: { type: 'base64', media_type: a.mediaType, data: a.data.toString('base64') } }
      : { type: 'image', source: { type: 'base64', media_type: a.mediaType, data: a.data.toString('base64') } },
  )
  last.content = [...files, { type: 'text', text: last.content as string }]
  return messages
}

export const anthropicAdapter: Adapter = async (provider, request) => {
  const secretName = provider.config.key_vault_secret
  if (!secretName) throw new Error(`Provider "${provider.name}" has no Key Vault secret configured.`)
  const model = provider.config.model || DEFAULT_MODEL
  const effort = request.effort ?? EFFORTS.find((e) => e === provider.config.effort) ?? 'high'
  const fallback = SUPPORTS_DEFAULT_FALLBACK.has(model)

  const client = new Anthropic({ apiKey: await getSecret(secretName) })
  let message: Anthropic.Beta.BetaMessage
  try {
    message = await client.beta.messages
      .stream({
        model,
        max_tokens: request.maxTokens ?? 64_000,
        output_config: { effort },
        ...(request.system ? { system: request.system } : {}),
        messages: withAttachments(request),
        ...(fallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
      })
      .finalMessage()
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      throw new Error(`The key in Key Vault secret "${secretName}" was rejected by the Anthropic API.`)
    }
    if (err instanceof Anthropic.NotFoundError) {
      throw new Error(`The Anthropic API doesn't recognize model "${model}".`)
    }
    throw err
  }

  if (message.stop_reason === 'refusal') {
    const category = message.stop_details?.category
    throw new AiRefusedError(`The model declined this request${category ? ` (${category})` : ''}.`)
  }
  if (message.stop_reason === 'max_tokens') {
    throw new Error(`The response was cut off at ${request.maxTokens ?? 64_000} tokens.`)
  }

  return {
    text: message.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join(''),
    model: message.model,
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
  }
}
