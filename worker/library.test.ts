// Upload -> scan -> extract -> search, end to end against a real (PGlite)
// database, with file contents served from memory instead of Blob Storage.

import { randomBytes } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { as, createDb, makeProfile, sql } from '../db/tests/harness.js'
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
let cta: string, reviewer: string, otherCta: string, learner: string

async function member(client: string, email: string, roles: string[]) {
  const id = await makeProfile(pglite, email)
  await sql(pglite, 'insert into client_memberships (client_id, profile_id, roles) values ($1, $2, $3)', [client, id, roles])
  return id
}

/** Uploads like the API server does, then runs the worker until the queue is empty. */
async function uploadAndProcess(who: string, client: string, filename: string, content: Buffer) {
  const [file] = await as(pglite, who)('select * from start_upload($1, $2, null, $3)', [client, filename, content.length])
  blobs.set(file.blob_path, content)
  let asset
  await pglite.transaction(async (tx) => {
    await tx.query('set local role service_role')
    ;[asset] = (await tx.query('select * from complete_upload($1, $2, $3)', [file.id, content.length, randomBytes(32).toString('hex')])).rows
  })
  while ((await runOnce(db, 'w', handlers, { log: quiet })) > 0) {}
  return asset as unknown as { id: string; current_version_id: string }
}

const search = (who: string, client: string | null, query: string) =>
  as(pglite, who)('select * from search_library($1, $2)', [client, query])

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
  reviewer = await member(meridian, 'reviewer@m.example', ['reviewer'])
  learner = await member(meridian, 'learner@m.example', ['learner'])
  otherCta = await member(calder, 'cta@c.example', ['client_training_admin'])
})

describe('extraction', () => {
  it('reads an upload into chunks once the scan allows it', async () => {
    const asset = await uploadAndProcess(cta, meridian, 'accruals.txt',
      Buffer.from('Period-end accruals\nPost the accrual journal entry with FBS1.\n\nReverse it on day one with F.81.'))
    const [version] = await sql(pglite, 'select extraction_status, extraction_detail from knowledge_asset_versions where id = $1',
      [asset.current_version_id])
    expect(version).toEqual({ extraction_status: 'done', extraction_detail: 'Read 1 passage.' })
    const chunks = await sql(pglite, 'select ordinal, locator, text, client_id from source_chunks where asset_id = $1', [asset.id])
    expect(chunks).toEqual([{
      ordinal: 1, locator: { lines: '1-4' }, client_id: meridian,
      text: 'Period-end accruals\nPost the accrual journal entry with FBS1.\nReverse it on day one with F.81.',
    }])
  })

  it('records a file that cannot be read as failed, with the reason, without retrying', async () => {
    const asset = await uploadAndProcess(cta, meridian, 'broken.docx', Buffer.from('not really a docx'))
    const [version] = await sql(pglite, 'select extraction_status, extraction_detail from knowledge_asset_versions where id = $1',
      [asset.current_version_id])
    expect(version.extraction_status).toBe('failed')
    expect(version.extraction_detail).toMatch(/not a valid Office document/)
    const [job] = await sql(pglite, `select status from jobs where kind = 'extract_version' and payload->>'version_id' = $1`,
      [asset.current_version_id])
    expect(job.status).toBe('succeeded')
  })

  it('marks images as needing OCR', async () => {
    const asset = await uploadAndProcess(cta, meridian, 'screen.png', Buffer.from([0x89, 0x50, 0x4e, 0x47]))
    const [version] = await sql(pglite, 'select extraction_status from knowledge_asset_versions where id = $1', [asset.current_version_id])
    expect(version.extraction_status).toBe('needs_ocr')
  })
})

describe('search', () => {
  beforeAll(async () => {
    await uploadAndProcess(otherCta, calder, 'calder-journal.txt', Buffer.from('Calder posts every journal entry in FB50 after approval.'))
  })

  it('finds passages with highlighted matches and where they are', async () => {
    const results = await search(cta, meridian, 'accrual entry')
    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({ title: 'accruals', filename: 'accruals.txt', version_no: 1, locator: { lines: '1-4' } })
    expect(results[0].snippet).toContain('[[accrual]]')
  })

  it("never returns another client's passages, even for a matching word", async () => {
    expect((await search(cta, meridian, 'journal')).map((r) => r.filename)).toEqual(['accruals.txt'])
    expect((await search(cta, calder, 'journal'))).toEqual([])
    expect((await search(otherCta, calder, 'journal')).map((r) => r.filename)).toEqual(['calder-journal.txt'])
  })

  it('returns nothing to people who cannot read the assets', async () => {
    expect(await search(reviewer, meridian, 'accrual')).toEqual([])
    expect(await search(learner, meridian, 'accrual')).toEqual([])
    expect(await as(pglite, learner)('select * from source_chunks')).toEqual([])
  })

  it('includes Global assets in a client search, and skips archived ones', async () => {
    const [global] = await sql(pglite, `insert into knowledge_assets (scope, title, security_classification, ai_use)
      values ('global', 'SAP accrual overview', 'public', 'reference') returning id`)
    const [version] = await sql(pglite, `insert into knowledge_asset_versions (asset_id, version_no) values ($1, 1) returning id`, [global.id])
    await sql(pglite, 'update knowledge_assets set current_version_id = $2 where id = $1', [global.id, version.id])
    // search_library joins the file for its name, so a Global asset needs one too.
    const [file] = await sql(pglite, `insert into source_files (blob_path, filename, upload_status, scan_status, uploaded_by)
      values ('global/x', 'overview.pdf', 'stored', 'clean', $1) returning id`, [cta])
    await sql(pglite, 'update knowledge_asset_versions set source_file_id = $2 where id = $1', [version.id, file.id])
    await sql(pglite, `select save_extraction($1, 'done', null, '[{"text": "Accruals in S/4HANA are reversed automatically.", "locator": {"page": 2}}]')`, [version.id])

    expect((await search(cta, meridian, 'accruals')).map((r) => r.title).sort()).toEqual(['SAP accrual overview', 'accruals'])
    expect(await search(learner, meridian, 'accruals')).toEqual([])

    await sql(pglite, `update knowledge_assets set lifecycle_status = 'archived' where id = $1`, [global.id])
    expect((await search(cta, meridian, 'accruals')).map((r) => r.title)).toEqual(['accruals'])
  })

  it('keeps the worker functions away from callers', async () => {
    await expect(as(pglite, cta)(`select save_extraction(gen_random_uuid(), 'done', null, '[]')`)).rejects.toThrow(/permission denied/)
  })
})
