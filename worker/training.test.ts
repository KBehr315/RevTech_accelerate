// Writing training drafts (00111, worker/training/), end to end against a real
// (PGlite) database, with a stand-in model that answers with a fixed draft.

import { randomBytes } from 'node:crypto'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { as, createDb, makeProfile, sql } from '../db/tests/harness.js'
import type { Adapter, CompletionRequest } from './ai/gateway.ts'
import { makeHandlers } from './handlers.ts'
import { runOnce, type Db } from './queue.ts'
import type { Draft } from './training/draft.ts'

let pglite: PGlite
let db: Db
let calls: CompletionRequest[]
let answer: Draft
const quiet = { info: () => {}, error: () => {} }

const fakeModel: Adapter = async (_provider, request) => {
  calls.push(request)
  return { text: JSON.stringify(answer), model: 'fake-writer', inputTokens: 1000, outputTokens: 500 }
}
const handlers = makeHandlers({ adapters: { anthropic: fakeModel }, scanVerdict: async () => null, readBlob: async () => Buffer.from('') })

let meridian: string, calder: string, cta: string, author: string, otherAuthor: string, learner: string, calderCta: string

const block = (over: Partial<Draft['sections'][number]['blocks'][number]> = {}) => ({
  type: 'text' as const, heading: '', body: '', items: [], correct: [], seconds: 0, media: '', citations: [], ...over,
})
const draftAnswer = (over: Partial<Draft> = {}): Draft => ({
  title: 'Post a General Journal Entry',
  audience: 'GL accountants',
  duration_minutes: 20,
  summary: 'How to post a journal entry.',
  objectives: ['Post a journal entry'],
  sections: [{
    heading: 'Posting',
    blocks: [block({ body: 'Open Post General Journal Entries (FB50).', citations: ['S1.1'] })],
    slides: [{ title: 'Posting', bullets: ['Use F0718'], notes: 'Say this.', media: '', citations: ['S1.1'] }],
  }],
  quiz: [
    { question: 'Which app?', choices: ['FB50', 'ME21N'], correct: [0], explanation: 'FB50 posts.', citations: [] },
    { question: 'Broken', choices: ['Only one'], correct: [3], explanation: '', citations: [] },
  ],
  review_notes: [],
  ...over,
})

async function member(client: string, email: string, roles: string[]) {
  const id = await makeProfile(pglite, email)
  await sql(pglite, 'insert into client_memberships (client_id, profile_id, roles) values ($1, $2, $3)', [client, id, roles])
  return id
}

/** A read document in a client's library, with one passage. */
async function documentWith(who: string, client: string, title: string, text: string) {
  const [file] = await as(pglite, who)('select * from start_upload($1, $2, null, 100)', [client, `${title}.docx`])
  let asset: { id: string; current_version_id: string } = { id: '', current_version_id: '' }
  await pglite.transaction(async (tx) => {
    await tx.query('set local role service_role')
    asset = (await tx.query('select * from complete_upload($1, 100, $2)', [file.id, randomBytes(32).toString('hex')])).rows[0] as typeof asset
  })
  await sql(pglite, `update source_files set scan_status = 'not_scanned' where id = $1`, [file.id])
  await sql(pglite, `select save_extraction($1, 'done', 'Read 1 page.', $2)`, [asset.current_version_id, JSON.stringify([{ text, locator: { page: 1 } }])])
  await sql(pglite, `delete from jobs where status = 'queued'`)
  return asset.id
}

const start = (who: string, client: string, brief: string, assets: string[] = [], videos: unknown[] = []) =>
  as(pglite, who)(`select * from start_training_draft($1, $2, '{slides,lesson}', '{flip_cards,drag_drop}', $3, $4)`, [
    client, brief, assets, JSON.stringify(videos),
  ])

async function generate(draftId: string) {
  while ((await runOnce(db, 'w', handlers, { log: quiet })) > 0) {}
  const [draft] = await sql(pglite, 'select * from training_drafts where id = $1', [draftId])
  return draft as { status: string; status_detail: string; title: string; content: Draft; model: string }
}

beforeAll(async () => {
  pglite = await createDb()
  const wrap = (q: Pick<PGlite, 'query'>): Db => ({
    query: (text, params) => q.query(text, params) as never,
    transaction: (fn) => pglite.transaction((tx) => fn(wrap(tx))),
  })
  db = wrap(pglite)
  await sql(pglite, `update platform_settings set malware_scanning = 'off'`)
  const [provider] = await sql(pglite, `insert into ai_providers (name, kind, max_classification, is_enabled)
    values ('Claude', 'anthropic', 'client_confidential', true) returning id`)
  ;[{ id: meridian }] = await sql(pglite, `insert into clients (name, slug, allowed_ai_providers) values ('Meridian', 'meridian', $1) returning id`, [[provider.id]])
  ;[{ id: calder }] = await sql(pglite, `insert into clients (name, slug) values ('Calder', 'calder') returning id`)
  cta = await member(meridian, 'cta@meridian.example', ['client_training_admin'])
  author = await member(meridian, 'author@meridian.example', ['contributor'])
  otherAuthor = await member(meridian, 'other@meridian.example', ['contributor'])
  learner = await member(meridian, 'learner@meridian.example', ['learner'])
  calderCta = await member(calder, 'cta@calder.example', ['client_training_admin'])
})

beforeEach(() => {
  calls = []
  answer = draftAnswer()
})

describe('starting a draft', () => {
  it('is for Training Administrators and Contributors, with a description', async () => {
    await expect(start(learner, meridian, 'Journal entries')).rejects.toThrow(/Only Training Administrators and Contributors/)
    await expect(start(calderCta, meridian, 'Journal entries')).rejects.toThrow(/Only Training Administrators and Contributors/)
    await expect(start(author, meridian, '   ')).rejects.toThrow(/Describe what the training should cover/)
    await expect(start(author, meridian, 'Journal entries', [], [{ url: 'https://evil.example/x', note: '' }])).rejects.toThrow(/YouTube/)
  })

  it("refuses documents the person can't use: another client's, or one not approved for AI", async () => {
    const calderDoc = await documentWith(calderCta, calder, 'Calder secret', 'Calder only')
    await expect(start(cta, meridian, 'Journal entries', [calderDoc])).rejects.toThrow(/can't be used for this training/)
    const blocked = await documentWith(cta, meridian, 'Blocked', 'No AI')
    await sql(pglite, `update knowledge_assets set ai_use = 'not_approved' where id = $1`, [blocked])
    await expect(start(cta, meridian, 'Journal entries', [blocked])).rejects.toThrow(/Blocked/)
  })

  it('shows a draft to its author and the Training Administrators only', async () => {
    const [draft] = await start(author, meridian, 'Accruals at month end')
    const seen = async (who: string) => (await as(pglite, who)('select id from training_drafts where id = $1', [draft.id])).length
    expect([await seen(author), await seen(cta), await seen(otherAuthor), await seen(learner)]).toEqual([1, 1, 0, 0])
    await sql(pglite, `delete from jobs where status = 'queued'`)
  })
})

describe('writing a draft', () => {
  it('writes from general knowledge when no documents are ticked, labeling it AI-generated', async () => {
    const [started] = await start(author, meridian, 'Journal entries for new GL accountants, 5 questions')
    const draft = await generate(started.id)

    expect(draft.status).toBe('ready')
    expect(draft.title).toBe('Post a General Journal Entry')
    expect(draft.model).toBe('fake-writer')
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ purpose: 'training_draft', classification: 'client_confidential', clientId: meridian })
    expect(calls[0].jsonSchema).toBeDefined()
    expect(calls[0].messages[0].content).toMatch(/No source documents were chosen/)
    expect(calls[0].messages[0].content).toMatch(/flip_cards: Flip cards/)

    const [section] = draft.content.sections
    expect(section.blocks[0]).toMatchObject({ citations: [], label: 'ai_generated' })
    expect(draft.content.quiz).toHaveLength(1)
    expect(draft.content.review_notes).toEqual(expect.arrayContaining([
      '1 quiz question(s) had no valid answer and were removed.',
      "2 citation(s) pointed to passages Claude wasn't given and were removed.",
    ]))
  })

  it('teaches from ticked documents first, keeping real citations and flagging unsupported codes', async () => {
    const doc = await documentWith(cta, meridian, 'Meridian GL procedure', 'Post journal entries with FB50. Amounts over $50,000 need a reference.')
    const [started] = await start(cta, meridian, 'Journal entries', [doc], [{ url: 'https://youtu.be/abc123', note: 'Overview' }])
    const draft = await generate(started.id)

    expect(draft.status).toBe('ready')
    expect(draft.status_detail).toBe('Written by fake-writer from 1 document. 2 things to check.')
    expect(calls[0].messages[0].content).toMatch(/\[S1\.1\] Post journal entries with FB50/)
    expect(calls[0].messages[0].content).toMatch(/video:1: Overview/)

    const [section] = draft.content.sections
    expect(section.blocks[0]).toMatchObject({ citations: ['S1.1'], label: 'source' })
    expect(section.slides[0]).toMatchObject({ citations: ['S1.1'], label: 'source' })
    expect(draft.content.review_notes).toContain('Slide "Posting": F0718 is not in the passages it cites. Check it.')
    expect(draft.content.sources).toEqual([{ ref: 'S1', asset_id: doc, title: 'Meridian GL procedure' }])
    expect(draft.content.videos).toEqual([{ ref: 'video:1', url: 'https://youtu.be/abc123', note: 'Overview' }])
  })

  it('records why when the client has no AI provider allowed, without retrying', async () => {
    const [started] = await start(calderCta, calder, 'Anything')
    const draft = await generate(started.id)
    expect(calls).toHaveLength(0)
    expect(draft.status).toBe('failed')
    expect(draft.status_detail).toMatch(/No enabled AI provider is allowed/)
  })
})
