// The gateway's policy (public.ai_route) and call log against a real (PGlite)
// database, with a stand-in adapter instead of a real provider.

import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { as, createDb, makeProfile, sql } from '../../db/tests/harness.js'
import { makeHandlers } from '../handlers.ts'
import { runOnce, type Db, type Job, type JobContext, asProfile } from '../queue.ts'
import { AiRefusedError, createGateway, type Adapter, type CompletionRequest } from './gateway.ts'

let pglite: PGlite
let db: Db
let admin: string
let calls: { provider: string; request: CompletionRequest }[]
const quiet = { info: () => {}, error: () => {} }

const fake: Adapter = async (provider, request) => {
  calls.push({ provider: provider.name, request })
  return { text: 'I can read this.', model: 'fake-model-1', inputTokens: 12, outputTokens: 5 }
}

beforeAll(async () => {
  pglite = await createDb()
  const wrap = (q: Pick<PGlite, 'query'>): Db => ({
    query: (text, params) => q.query(text, params) as never,
    transaction: (fn) => pglite.transaction((tx) => fn(wrap(tx))),
  })
  db = wrap(pglite)
  admin = await makeProfile(pglite, 'admin@example.com')
  await sql(pglite, `insert into platform_role_grants (profile_id, role) values ($1, 'platform_admin')`, [admin])
})

beforeEach(() => {
  calls = []
})

async function provider(name: string, maxClassification: string, enabled = true) {
  const [row] = await sql(pglite,
    `insert into ai_providers (name, kind, config, max_classification, is_enabled)
     values ($1, 'anthropic', '{"model": "fake-model-1"}', $2, $3) returning id`,
    [name, maxClassification, enabled])
  return row.id as string
}

async function client(slug: string, allowed: string[], maxClassification = 'client_confidential') {
  const [row] = await sql(pglite,
    `insert into clients (name, slug, allowed_ai_providers, max_classification) values ($1, $1, $2, $3) returning id`,
    [slug, allowed, maxClassification])
  return row.id as string
}

async function member(clientId: string, email: string, roles: string[]) {
  const id = await makeProfile(pglite, email)
  await sql(pglite, `insert into client_memberships (client_id, profile_id, roles) values ($1, $2, $3)`, [clientId, id, roles])
  return id
}

/** Runs one gateway call as `profileId`, the way a job's handler would. */
async function complete(profileId: string, request: Partial<CompletionRequest>) {
  const [job] = await sql(pglite, `insert into jobs (kind, requested_by, status, locked_at) values ('test', $1, 'running', now()) returning *`, [profileId])
  const ctx: JobContext = { db, workerId: 'test', asRequester: (fn) => asProfile(db, profileId, fn) }
  return createGateway(db, { anthropic: fake }).complete(job as Job, ctx, {
    purpose: 'test',
    classification: 'internal',
    clientId: null,
    messages: [{ role: 'user', content: 'hello' }],
    ...request,
  })
}

async function lastCall() {
  const [row] = await sql(pglite, 'select * from ai_calls order by created_at desc, id limit 1')
  return row
}

describe('ai_route', () => {
  it('uses a provider the client allows and logs the call', async () => {
    const p = await provider('Allowed', 'client_confidential')
    const c = await client('route-ok', [p])
    const author = await member(c, 'author@route-ok.example', ['contributor'])

    const done = await complete(author, { clientId: c, classification: 'client_confidential' })

    expect(done).toMatchObject({ provider: 'Allowed', text: 'I can read this.' })
    expect(await lastCall()).toMatchObject({
      client_id: c, provider_id: p, requested_by: author, outcome: 'succeeded',
      model: 'fake-model-1', input_tokens: 12, output_tokens: 5,
    })
  })

  it('refuses content above the provider ceiling, before calling it', async () => {
    const p = await provider('Internal only', 'internal')
    const c = await client('route-ceiling', [p])
    const author = await member(c, 'author@route-ceiling.example', ['contributor'])

    await expect(complete(author, { clientId: c, classification: 'confidential' })).rejects.toThrow(AiRefusedError)
    expect(calls).toHaveLength(0)
    expect(await lastCall()).toMatchObject({ client_id: c, outcome: 'refused', classification: 'confidential' })
  })

  it('refuses content above the client ceiling', async () => {
    const p = await provider('Wide', 'client_confidential')
    const c = await client('route-client-ceiling', [p], 'internal')
    const author = await member(c, 'author@route-client-ceiling.example', ['contributor'])
    await expect(complete(author, { clientId: c, classification: 'confidential' })).rejects.toThrow(/exceeds what this client allows/)
  })

  it('refuses a provider the client has not allowed, even if enabled', async () => {
    const allowed = await provider('Mine', 'client_confidential')
    const other = await provider('Theirs', 'client_confidential')
    const c = await client('route-not-allowed', [allowed])
    const author = await member(c, 'author@route-not-allowed.example', ['contributor'])

    await expect(complete(author, { clientId: c, providerId: other })).rejects.toThrow(/No enabled AI provider/)
    expect(calls).toHaveLength(0)
  })

  it('refuses CUI and export-controlled content in this environment', async () => {
    for (const classification of ['controlled', 'export_controlled'] as const) {
      await expect(complete(admin, { classification })).rejects.toThrow(/may not be sent to an AI provider/)
    }
    expect(calls).toHaveLength(0)
  })

  it('refuses learners and people from other clients', async () => {
    const p = await provider('Learner test', 'client_confidential')
    const c = await client('route-roles', [p])
    const learner = await member(c, 'learner@route-roles.example', ['learner'])
    const outsider = await member(await client('route-roles-other', [p]), 'author@route-roles-other.example', ['contributor'])

    await expect(complete(learner, { clientId: c })).rejects.toThrow(/may not generate content for this client/)
    await expect(complete(outsider, { clientId: c })).rejects.toThrow(/may not generate content for this client/)
    expect(calls).toHaveLength(0)
  })

  it('keeps platform-level calls to Platform and Global Knowledge Administrators', async () => {
    const someone = await makeProfile(pglite, 'someone@example.com')
    await expect(complete(someone, {})).rejects.toThrow(/Only Platform or Global Knowledge Administrators/)
  })

  it('lets a Platform Administrator test a disabled provider, but not use it otherwise', async () => {
    const p = await provider('Not yet enabled', 'internal', false)
    const c = await client('route-disabled', [])
    const cta = await member(c, 'cta@route-disabled.example', ['client_training_admin'])

    await expect(complete(admin, { providerId: p })).resolves.toMatchObject({ provider: 'Not yet enabled' })
    await expect(complete(cta, { clientId: c, providerId: p })).rejects.toThrow(/No enabled AI provider/)
  })

  it('is not callable as record_ai_call by people, and ai_calls is read-only to them', async () => {
    await expect(
      as(pglite, admin)(`select record_ai_call(null, null, null, null, 'x', 'public', null, 'succeeded', null, 1, 1, 1)`),
    ).rejects.toThrow(/permission denied/)
    await expect(as(pglite, admin)(`delete from ai_calls`)).rejects.toThrow(/permission denied/)
  })

  it('shows a client its own calls and not another client\'s', async () => {
    const p = await provider('Visibility', 'client_confidential')
    const a = await client('calls-a', [p])
    const b = await client('calls-b', [p])
    const authorA = await member(a, 'author@calls-a.example', ['contributor'])
    const ctaB = await member(b, 'cta@calls-b.example', ['client_training_admin'])
    await complete(authorA, { clientId: a })

    expect(await as(pglite, ctaB)('select * from ai_calls where client_id = $1', [a])).toHaveLength(0)
    expect(await as(pglite, authorA)('select * from ai_calls where client_id = $1', [a])).toHaveLength(1)
  })
})

describe('ai_provider_test job', () => {
  it('runs through the worker and records the reply', async () => {
    const p = await provider('Job test', 'internal', false)
    const [job] = await as(pglite, admin)('select * from request_ai_provider_test($1)', [p])
    expect(job.max_attempts).toBe(1)

    await runOnce(db, 'test-worker', makeHandlers({ anthropic: fake }), { log: quiet })

    const [done] = await sql(pglite, 'select status, result from jobs where id = $1', [job.id])
    expect(done).toMatchObject({ status: 'succeeded', result: { provider: 'Job test', reply: 'I can read this.' } })
  })

  it('is for Platform Administrators only', async () => {
    const p = await provider('Job test 2', 'internal')
    const someone = await makeProfile(pglite, 'someone-else@example.com')
    await expect(as(pglite, someone)('select * from request_ai_provider_test($1)', [p])).rejects.toThrow(/Only a Platform Administrator/)
  })
})
