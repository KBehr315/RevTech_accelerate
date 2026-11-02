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
    expect(draft.content.sources).toEqual([{ ref: 'S1', asset_id: doc, title: 'Meridian GL procedure', public_title: 'Meridian GL procedure' }])
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

describe('writing for the client', () => {
  it("names only the client: other companies the sources name, and the platform's other clients, become the client", async () => {
    const doc = await documentWith(cta, meridian, 'Codan GL procedure', 'Codan posts journal entries with FB50.')
    answer = draftAnswer({
      summary: "In Codan's system you post entries.",
      sections: [{
        heading: 'Posting at Codan',
        blocks: [block({ body: 'Codan and Calder post with FB50. Codanite is a mineral.', citations: ['S1.1'] })],
        slides: [],
      }],
      other_companies: ['Codan', 'Meridian'],
    })
    const [started] = await start(cta, meridian, 'Journal entries', [doc])
    const draft = await generate(started.id)

    expect(calls[0].messages[0].content).toMatch(/The training is for Meridian\. Name no other company\./)
    expect(draft.content.summary).toBe("In Meridian's system you post entries.")
    expect(draft.content.sections[0].heading).toBe('Posting at Meridian')
    // Whole words only: "Codanite" stays.
    expect(draft.content.sections[0].blocks[0].body).toBe('Meridian and Meridian post with FB50. Codanite is a mineral.')
    expect(draft.content.review_notes).toContain('Names of other companies (Codan, Calder) were replaced with Meridian. Check the wording still reads well.')
    // The library keeps the document's real name; the deck gets the client's.
    expect(draft.content.sources![0]).toMatchObject({ title: 'Codan GL procedure', public_title: 'Meridian GL procedure' })
    expect(draft.content.renamed).toEqual(['Calder', 'Codan'])
  })
})

describe('reviewing a draft', () => {
  let draftId: string
  let blockId: string
  let questionId: string

  beforeAll(async () => {
    calls = []
    answer = draftAnswer()
    const [started] = await start(author, meridian, 'Journal entries')
    draftId = started.id
    const draft = await generate(draftId)
    blockId = draft.content.sections[0].blocks[0].id!
    questionId = draft.content.quiz[0].id!
  })

  const checks = async () => sql(pglite, 'select part_id, checked_by from training_reviews where draft_id = $1 order by part_id', [draftId])
  const content = async () => ((await sql(pglite, 'select content from training_drafts where id = $1', [draftId]))[0] as { content: Draft }).content

  it('gives every piece an id', async () => {
    const draft = await content()
    expect(draft.sections[0].slides[0].id).toMatch(/^[0-9a-f-]{36}$/)
    expect(new Set([blockId, questionId, draft.sections[0].slides[0].id]).size).toBe(3)
  })

  it('lets the author and Training Administrators tick pieces and notes as checked, and no one else', async () => {
    await as(pglite, author)('select check_training_part($1, $2, true)', [draftId, blockId])
    await as(pglite, cta)("select check_training_part($1, 'note:0', true)", [draftId])
    expect(await checks()).toEqual([
      { part_id: blockId, checked_by: author },
      { part_id: 'note:0', checked_by: cta },
    ])
    expect(await as(pglite, learner)('select part_id from training_reviews where draft_id = $1', [draftId])).toHaveLength(0)

    await expect(as(pglite, otherAuthor)('select check_training_part($1, $2, true)', [draftId, blockId])).rejects.toThrow(/can't review it/)
    await expect(as(pglite, learner)('select check_training_part($1, $2, true)', [draftId, blockId])).rejects.toThrow(/can't review it/)
    await expect(as(pglite, cta)("select check_training_part($1, 'nope', true)", [draftId])).rejects.toThrow(/no longer in the draft/)
    await expect(as(pglite, cta)("select check_training_part($1, 'note:99', true)", [draftId])).rejects.toThrow(/no longer in the draft/)

    await as(pglite, cta)("select check_training_part($1, 'note:0', false)", [draftId])
    expect(await checks()).toEqual([{ part_id: blockId, checked_by: author }])
  })

  it('saves a hand edit: only the fields the piece has, labeled edited and checked by the editor', async () => {
    await as(pglite, cta)('select edit_training_part($1, $2, $3)', [
      draftId, questionId,
      JSON.stringify({ question: 'Which app posts a journal entry?', choices: 'not a list', citations: ['S9.9'], label: 'source', id: 'x', extra: 1 }),
    ])
    const question = (await content()).quiz[0]
    expect(question).toMatchObject({ id: questionId, question: 'Which app posts a journal entry?', choices: ['FB50', 'ME21N'], citations: [], label: 'edited' })
    expect(question).not.toHaveProperty('extra')
    expect(await checks()).toContainEqual({ part_id: questionId, checked_by: cta })
  })

  it('has Claude rewrite one piece from an instruction, then asks for it to be checked again', async () => {
    await expect(as(pglite, author)('select revise_training_part($1, $2, $3)', [draftId, blockId, '  '])).rejects.toThrow(/Say what should change/)
    const [revision] = await as(pglite, author)('select * from revise_training_part($1, $2, $3)', [draftId, blockId, 'Calder uses F0718, say so'])
    await expect(as(pglite, author)('select revise_training_part($1, $2, $3)', [draftId, blockId, 'Again'])).rejects.toThrow(/already rewriting/)
    await expect(as(pglite, author)('select edit_training_part($1, $2, $3)', [draftId, blockId, '{"body":"x"}'])).rejects.toThrow(/Claude is rewriting/)

    calls = []
    answer = {
      part: block({ body: 'Calder posts with Post General Journal Entries (F0718).', citations: ['S1.1'] }),
      review_notes: ['Confirm the app name.'],
      other_companies: [],
    } as unknown as Draft
    await generate(draftId)

    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ purpose: 'training_revision', clientId: meridian })
    expect(calls[0].messages[0].content).toMatch(/Calder uses F0718, say so/)
    expect(calls[0].messages[0].content).toMatch(/Open Post General Journal Entries \(FB50\)\./)

    const draft = await content()
    // No documents were used, so the citation is dropped and it stays AI-generated; Calder, another client, is replaced.
    expect(draft.sections[0].blocks[0]).toMatchObject({
      id: blockId,
      body: 'Meridian posts with Post General Journal Entries (F0718).',
      citations: [],
      label: 'ai_generated',
    })
    expect(draft.review_notes).toContain('Revision of "Posting": Confirm the app name.')
    expect(await checks()).not.toContainEqual(expect.objectContaining({ part_id: blockId }))
    const [done] = await sql(pglite, 'select status, detail from training_revisions where id = $1', [revision.id])
    expect(done).toEqual({ status: 'done', detail: 'Rewritten by fake-writer. Check it again.' })
  })
})
