// "Read again" (00107): a file left unread is queued again by someone allowed
// to send it to AI, and its copies in other buckets get the same text.

import { randomBytes } from 'node:crypto'
import { PDFDocument } from 'pdf-lib'
import { beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { as, createDb, makeProfile, sql } from '../db/tests/harness.js'
import type { Adapter } from './ai/gateway.ts'
import { makeHandlers } from './handlers.ts'
import { runOnce, type Db } from './queue.ts'

let pglite: PGlite
let db: Db
const blobs = new Map<string, Buffer>()
const quiet = { info: () => {}, error: () => {} }

const fakeModel: Adapter = async (_provider, request) => {
  const pages = (await PDFDocument.load(request.attachments![0].data)).getPageCount()
  const text = Array.from({ length: pages }, (_, i) => `=== Page ${i + 1} ===\nCava ledger page ${i + 1}`).join('\n')
  return { text, model: 'fake-ocr', inputTokens: 100, outputTokens: 20 }
}
const handlers = makeHandlers({
  adapters: { anthropic: fakeModel },
  scanVerdict: async () => null,
  readBlob: async (path) => blobs.get(path) ?? Buffer.from(''),
})

let meridian: string, provider: string
let kelly: string, reviewer: string, gka: string

const work = async () => {
  while ((await runOnce(db, 'w', handlers, { log: quiet })) > 0) {}
}
const versionOf = async (assetId: string) =>
  (await sql(pglite, `select v.extraction_status, v.extraction_detail from knowledge_asset_versions v
    join knowledge_assets a on a.current_version_id = v.id where a.id = $1`, [assetId]))[0]
const chunksOf = (assetId: string) =>
  sql(pglite, 'select client_id, locator, text from source_chunks where asset_id = $1 order by ordinal', [assetId])

/** A scanned PDF uploaded to Meridian while it allows no AI provider: left as needs_ocr. */
async function unreadScan(name: string) {
  const doc = await PDFDocument.create()
  doc.addPage()
  doc.addPage()
  const content = Buffer.from(await doc.save())
  const [file] = await as(pglite, kelly)('select * from start_upload($1, $2, null, $3)', [meridian, name, content.length])
  blobs.set(file.blob_path, content)
  let id = ''
  await pglite.transaction(async (tx) => {
    await tx.query('set local role service_role')
    id = ((await tx.query('select id from complete_upload($1, $2, $3)', [file.id, content.length, randomBytes(32).toString('hex')])).rows[0] as { id: string }).id
  })
  await work()
  return id
}

beforeAll(async () => {
  pglite = await createDb()
  const wrap = (q: Pick<PGlite, 'query'>): Db => ({
    query: (text, params) => q.query(text, params) as never,
    transaction: (fn) => pglite.transaction((tx) => fn(wrap(tx))),
  })
  db = wrap(pglite)
  await sql(pglite, `update platform_settings set malware_scanning = 'off'`)
  ;[{ id: provider }] = await sql(pglite, `insert into ai_providers (name, kind, max_classification, is_enabled)
    values ('Claude', 'anthropic', 'client_confidential', true) returning id`)
  ;[{ id: meridian }] = await sql(pglite, `insert into clients (name, slug) values ('Meridian', 'm') returning id`)
  kelly = await makeProfile(pglite, 'kelly@revtech.example')
  await sql(pglite, `insert into client_memberships (client_id, profile_id, roles) values ($1, $2, '{client_training_admin}')`, [meridian, kelly])
  await sql(pglite, `insert into platform_role_grants (profile_id, role) values ($1, 'global_knowledge_admin')`, [kelly])
  reviewer = await makeProfile(pglite, 'reviewer@m.example')
  await sql(pglite, `insert into client_memberships (client_id, profile_id, roles) values ($1, $2, '{reviewer}')`, [meridian, reviewer])
  gka = await makeProfile(pglite, 'gka@revtech.example')
  await sql(pglite, `insert into platform_role_grants (profile_id, role) values ($1, 'global_knowledge_admin')`, [gka])
})

describe('reading a file again', () => {
  it('reads the original once AI is allowed, and fills its RevTech Reference copy too', async () => {
    const original = await unreadScan('cava.pdf')
    expect((await versionOf(original)).extraction_status).toBe('needs_ocr')
    const [copy] = await as(pglite, kelly)(`select * from copy_asset($1, 'revtech_reference')`, [original])
    expect((await versionOf(copy.id)).extraction_status).toBe('needs_ocr')

    await sql(pglite, 'update clients set allowed_ai_providers = $2 where id = $1', [meridian, [provider]])
    const [job] = await as(pglite, kelly)('select * from request_extraction($1)', [original])
    expect(job).toMatchObject({ kind: 'extract_version', client_id: meridian, requested_by: kelly })
    expect((await versionOf(original)).extraction_status).toBe('pending')
    await work()

    expect(await versionOf(original)).toEqual({ extraction_status: 'done', extraction_detail: '2 scanned pages read by AI.' })
    expect((await chunksOf(original)).map((c) => c.text)).toEqual(['Cava ledger page 1', 'Cava ledger page 2'])
    expect((await versionOf(copy.id)).extraction_status).toBe('done')
    const copied = await chunksOf(copy.id)
    expect(copied.map((c) => [c.client_id, c.text])).toEqual([[null, 'Cava ledger page 1'], [null, 'Cava ledger page 2']])

    const [audit] = await sql(pglite, `select * from audit_events where action = 'asset.read_again' and target_id = $1`, [original])
    expect(audit.details).toMatchObject({ previous_status: 'needs_ocr' })
  })

  it('reads a RevTech Reference copy on its own, outside the client', async () => {
    await sql(pglite, `update clients set allowed_ai_providers = '{}' where id = $1`, [meridian])
    const original = await unreadScan('ledger.pdf')
    const [copy] = await as(pglite, kelly)(`select * from copy_asset($1, 'revtech_reference')`, [original])

    await as(pglite, gka)('select request_extraction($1)', [copy.id])
    await work()
    expect((await versionOf(copy.id)).extraction_status).toBe('done')
    // The client's original was not readable then, and now gets the text too.
    expect((await chunksOf(original)).map((c) => [c.client_id, c.text])).toEqual([
      [meridian, 'Cava ledger page 1'],
      [meridian, 'Cava ledger page 2'],
    ])
  })

  it('is for people who may send the file to AI, once at a time', async () => {
    const original = await unreadScan('third.pdf')
    await expect(as(pglite, reviewer)('select request_extraction($1)', [original])).rejects.toThrow(/No such document/)
    await sql(pglite, `insert into work_grants (client_id, profile_id, capacity, target_type, target_id)
      values ($1, $2, 'reviewer', 'asset', $3)`, [meridian, reviewer, original])
    await expect(as(pglite, reviewer)('select request_extraction($1)', [original])).rejects.toThrow(/Only Client Training Administrators and Contributors/)
    // gka is not a Meridian member, so cannot see Meridian's document.
    await expect(as(pglite, gka)('select request_extraction($1)', [original])).rejects.toThrow(/No such document/)

    await as(pglite, kelly)('select request_extraction($1)', [original])
    await expect(as(pglite, kelly)('select request_extraction($1)', [original])).rejects.toThrow(/already being read/)
  })
})
