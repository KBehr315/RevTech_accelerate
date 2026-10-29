// Duplicates and versions (00108), end to end: exact copies refused, new
// versions uploaded on purpose, and "looks like a newer version" suggestions
// with their three choices.

import { createHash } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { as, createDb, makeProfile, sql } from '../db/tests/harness.js'
import { findResemblances, normalizeName } from './extract/similar.ts'
import { makeHandlers } from './handlers.ts'
import { runOnce, type Db } from './queue.ts'

let pglite: PGlite
let db: Db
const blobs = new Map<string, Buffer>()
const quiet = { info: () => {}, error: () => {} }
const handlers = makeHandlers({
  adapters: {},
  scanVerdict: async () => null,
  readBlob: async (path) => blobs.get(path) ?? Buffer.from(''),
})

let meridian: string, calder: string
let cta: string, author: string, author2: string, calderCta: string

async function member(client: string, email: string, roles: string[]) {
  const id = await makeProfile(pglite, email)
  await sql(pglite, 'insert into client_memberships (client_id, profile_id, roles) values ($1, $2, $3)', [client, id, roles])
  return id
}

type Asset = { id: string; title: string; current_version_id: string }

/** Uploads like the API server does (sha256 of the content), then runs the worker. */
async function upload(who: string, client: string | null, filename: string, text: string, opts: { assetId?: string; note?: string } = {}) {
  const content = Buffer.from(text)
  const [file] = await as(pglite, who)('select * from start_upload($1, $2, null, $3, $4, $5)',
    [client, filename, content.length, opts.assetId ?? null, opts.note ?? null])
  blobs.set(file.blob_path, content)
  let asset: Asset
  try {
    asset = await pglite.transaction(async (tx) => {
      await tx.query('set local role service_role')
      return (await tx.query('select * from complete_upload($1, $2, $3)',
        [file.id, content.length, createHash('sha256').update(content).digest('hex')])).rows[0] as Asset
    })
  } catch (err) {
    await sql(pglite, 'select fail_upload($1)', [file.id])
    throw err
  }
  while ((await runOnce(db, 'w', handlers, { log: quiet })) > 0) {}
  return asset
}

const versions = (assetId: string) =>
  sql(pglite, 'select version_no, change_note from knowledge_asset_versions where asset_id = $1 order by version_no', [assetId])
const suggestions = (who: string, assetId: string) =>
  as(pglite, who)('select id, existing_asset_id, same_name, text_similarity, status from duplicate_candidates where asset_id = $1', [assetId])

// A test script long enough that a few changed lines leave most five-word sequences intact.
const SCRIPT = Array.from({ length: 40 }, (_, i) =>
  `Step ${i + 1}: open transaction FB50 and enter the posting date, company code and line item ${i + 1}.`).join('\n')

beforeAll(async () => {
  pglite = await createDb()
  const wrap = (q: Pick<PGlite, 'query'>): Db => ({
    query: (text, params) => q.query(text, params) as never,
    transaction: (fn) => pglite.transaction((tx) => fn(wrap(tx))),
  })
  db = wrap(pglite)
  await sql(pglite, `update platform_settings set malware_scanning = 'off'`)
  ;[{ id: meridian }] = await sql(pglite, `insert into clients (name, slug) values ('Meridian', 'm') returning id`)
  ;[{ id: calder }] = await sql(pglite, `insert into clients (name, slug) values ('Calder', 'c') returning id`)
  cta = await member(meridian, 'cta@m.example', ['client_training_admin'])
  author = await member(meridian, 'author@m.example', ['contributor'])
  author2 = await member(meridian, 'author2@m.example', ['contributor'])
  calderCta = await member(calder, 'cta@c.example', ['client_training_admin'])
})

describe('names', () => {
  it('ignores version words, copy markers, dates and separators', () => {
    const base = normalizeName('Codan-R2R-03-Financial-Close-Test-Script.docx')
    expect(base).toBe('codan r2r 03 financial close test script')
    for (const name of [
      'Codan_R2R_03_Financial_Close_Test_Script_v2.docx',
      'Codan-R2R-03-Financial-Close-Test-Script (1).docx',
      'Codan R2R 03 Financial Close Test Script FINAL 2026-10-29.pdf',
      'Codan-R2R-03-Financial-Close-Test-Script rev 3.docx',
    ]) expect(normalizeName(name)).toBe(base)
    expect(normalizeName('Codan-R2R-04-Financial-Reporting-Test-Script.docx')).not.toBe(base)
  })

  it('suggests same-name or mostly-same-text documents, best first', () => {
    const found = findResemblances('Close v2.docx', SCRIPT, [
      { asset_id: 'a', title: 'Unrelated', filename: 'Unrelated.docx', text: 'Something else entirely about payroll and benefits.' },
      { asset_id: 'b', title: 'Old script', filename: 'Old script.docx', text: SCRIPT.replace('line item 7', 'line item seven') },
      { asset_id: 'c', title: 'Close', filename: 'Close.docx', text: 'short' },
    ])
    expect(found.map((f) => f.existing_asset_id)).toEqual(['c', 'b'])
    expect(found[1].text_similarity).toBeGreaterThan(0.9)
  })
})

describe('exact copies', () => {
  it('refuses an exact copy in the same client, naming the document to someone who can see it', async () => {
    await upload(cta, meridian, 'Close calendar.xlsx', 'close calendar contents')
    await expect(upload(cta, meridian, 'Close calendar (copy).xlsx', 'close calendar contents'))
      .rejects.toThrow('The library already has this file: "Close calendar". Nothing was added.')
    // A Contributor who can't see that document isn't told its name.
    await expect(upload(author, meridian, 'calendar.xlsx', 'close calendar contents'))
      .rejects.toThrow('The library already has this file. Nothing was added.')
    // Nothing was added.
    expect((await sql(pglite, `select count(*)::int as n from knowledge_assets where client_id = $1`, [meridian]))[0].n).toBe(1)
  })

  it('compares within one client only', async () => {
    const asset = await upload(calderCta, calder, 'Close calendar.xlsx', 'close calendar contents')
    expect(asset.title).toBe('Close calendar')
  })

  it('accepts the file again once the earlier document is archived', async () => {
    const first = await upload(cta, meridian, 'Old memo.txt', 'old memo text')
    await sql(pglite, `update knowledge_assets set lifecycle_status = 'archived' where id = $1`, [first.id])
    expect((await upload(cta, meridian, 'Old memo.txt', 'old memo text')).title).toBe('Old memo')
  })
})

describe('uploading a new version on purpose', () => {
  it('adds the next version with its note, makes it current, and needs approval again', async () => {
    const doc = await upload(cta, meridian, 'FI-GL-010 Post Journal Entry.txt', SCRIPT)
    await sql(pglite, `update knowledge_assets set approval_status = 'approved', ai_use = 'generation' where id = $1`, [doc.id])

    const updated = await upload(cta, null, 'FI-GL-010 Post Journal Entry v2.txt', `${SCRIPT}\nStep 41: post.`,
      { assetId: doc.id, note: 'Added the posting step' })
    expect(updated).toMatchObject({ id: doc.id, approval_status: 'draft', ai_use: 'human_approval_required' })
    expect(await versions(doc.id)).toEqual([
      { version_no: 1, change_note: 'Uploaded' },
      { version_no: 2, change_note: 'Added the posting step' },
    ])
    // Search finds the new text, from version 2 only.
    const hits = await as(pglite, cta)(`select version_no from search_library($1, 'posting step 41')`, [meridian])
    expect(hits.map((h) => h.version_no)).toEqual([2])
    // A deliberate version isn't also suggested as a duplicate of its own document.
    expect(await suggestions(cta, doc.id)).toEqual([])

    await expect(upload(cta, null, 'again.txt', `${SCRIPT}\nStep 41: post.`, { assetId: doc.id }))
      .rejects.toThrow(/same as the current version/)
  })

  it('is for Training Administrators and Contributors who can see the document, never on a copy', async () => {
    const doc = await upload(cta, meridian, 'Payment run.txt', 'payment run F110 text')
    await expect(as(pglite, author)(`select start_upload(null, 'x.txt', null, 5, $1)`, [doc.id])).rejects.toThrow(/No such document/)
    await expect(as(pglite, calderCta)(`select start_upload(null, 'x.txt', null, 5, $1)`, [doc.id])).rejects.toThrow(/No such document/)

    const gkaCta = await member(meridian, 'kelly@revtech.example', ['client_training_admin'])
    await sql(pglite, `insert into platform_role_grants (profile_id, role) values ($1, 'global_knowledge_admin')`, [gkaCta])
    const [copy] = await as(pglite, gkaCta)(`select * from copy_asset($1, 'revtech_reference')`, [doc.id])
    await expect(as(pglite, gkaCta)(`select start_upload(null, 'x.txt', null, 5, $1)`, [copy.id])).rejects.toThrow(/Add the new version to the original/)
  })
})

describe('"looks like a newer version"', () => {
  it('suggests it after reading, and "Make it a new version" moves it under the existing document', async () => {
    const existing = await upload(author, meridian, 'Accrual walkthrough.txt', SCRIPT.replace(/FB50/g, 'FBS1'))
    const newer = await upload(author, meridian, 'Accrual walkthrough v2.txt', SCRIPT.replace(/FB50/g, 'FBS1').replace('line item 3.', 'line item 3, then save.'))

    const [suggestion] = await suggestions(author, newer.id)
    expect(suggestion).toMatchObject({ existing_asset_id: existing.id, same_name: true, status: 'open' })
    expect(suggestion.text_similarity).toBeGreaterThan(0.8)
    // Another Contributor, who can see neither document, sees no suggestion.
    expect(await suggestions(author2, newer.id)).toEqual([])
    await expect(as(pglite, author2)(`select resolve_duplicate($1, 'new_version')`, [suggestion.id])).rejects.toThrow(/No such suggestion/)

    const [result] = await as(pglite, author)(`select * from resolve_duplicate($1, 'new_version')`, [suggestion.id])
    expect(result.id).toBe(existing.id)
    expect(await versions(existing.id)).toEqual([
      { version_no: 1, change_note: 'Uploaded' },
      { version_no: 2, change_note: 'Uploaded as "Accrual walkthrough v2"' },
    ])
    expect(await sql(pglite, 'select id from knowledge_assets where id = $1', [newer.id])).toEqual([])
    const chunkAssets = await sql(pglite, 'select distinct asset_id from source_chunks where asset_version_id = $1', [newer.current_version_id])
    expect(chunkAssets).toEqual([{ asset_id: existing.id }])
    const hits = await as(pglite, author)(`select title, version_no from search_library($1, 'then save')`, [meridian])
    expect(hits).toEqual([{ title: 'Accrual walkthrough', version_no: 2 }])

    const [audit] = await sql(pglite, `select details from audit_events where action = 'asset.duplicate_new_version' and target_id = $1`, [existing.id])
    expect(audit.details).toMatchObject({ upload_title: 'Accrual walkthrough v2', version_no: 2 })
  })

  it('"Keep separate" leaves both, and "Remove" archives the upload', async () => {
    const existing = await upload(cta, meridian, 'Asset retirement.txt', 'Retire the asset with ABAVN and post the retirement document.')
    const keep = await upload(cta, meridian, 'Asset retirement - Calder style.txt', 'Totally different wording about retiring.')
    const remove = await upload(cta, meridian, 'Asset retirement (1).txt', 'Retire the asset with ABAVN and post the retirement document today.')

    const [keepSuggestion] = await suggestions(cta, keep.id)
    expect(keepSuggestion).toBeUndefined() // different name once normalized, different text

    const [removeSuggestion] = await suggestions(cta, remove.id)
    expect(removeSuggestion).toMatchObject({ existing_asset_id: existing.id, same_name: true })
    await as(pglite, cta)(`select resolve_duplicate($1, 'remove')`, [removeSuggestion.id])
    expect((await sql(pglite, 'select lifecycle_status from knowledge_assets where id = $1', [remove.id]))[0].lifecycle_status).toBe('archived')
    expect((await suggestions(cta, remove.id))[0].status).toBe('removed')
    await expect(as(pglite, cta)(`select resolve_duplicate($1, 'separate')`, [removeSuggestion.id])).rejects.toThrow(/already been dealt with/)

    const third = await upload(cta, meridian, 'Asset retirement final.txt', 'Something unrelated but with the same name.')
    const [separate] = await suggestions(cta, third.id)
    await as(pglite, cta)(`select resolve_duplicate($1, 'separate')`, [separate.id])
    expect((await suggestions(cta, third.id))[0].status).toBe('separate')
    expect((await sql(pglite, 'select lifecycle_status from knowledge_assets where id = $1', [third.id]))[0].lifecycle_status).toBe('active')
  })

  it('never compares across clients', async () => {
    const calderDoc = await upload(calderCta, calder, 'Accrual walkthrough.txt', SCRIPT.replace(/FB50/g, 'FBS1') + ' calder')
    // Looking past RLS: nothing was recorded at all, not just hidden from Calder.
    expect(await sql(pglite, 'select * from duplicate_candidates where asset_id = $1', [calderDoc.id])).toEqual([])
  })

  it('keeps the worker functions away from callers', async () => {
    await expect(as(pglite, cta)('select * from similarity_candidates(gen_random_uuid())')).rejects.toThrow(/permission denied/)
    await expect(as(pglite, cta)(`select record_duplicate_candidates(gen_random_uuid(), '[]')`)).rejects.toThrow(/permission denied/)
  })
})
