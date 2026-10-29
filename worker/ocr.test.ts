// Reading images and scanned PDF pages through the gateway, end to end against
// a real (PGlite) database, with a stand-in model that "transcribes" from what
// it is sent.

import { randomBytes } from 'node:crypto'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { as, createDb, makeProfile, sql } from '../db/tests/harness.js'
import type { Adapter, CompletionRequest } from './ai/gateway.ts'
import { splitByPage } from './extract/ocr.ts'
import { makeHandlers } from './handlers.ts'
import { runOnce, type Db } from './queue.ts'

let pglite: PGlite
let db: Db
const blobs = new Map<string, Buffer>()
let calls: CompletionRequest[]
const quiet = { info: () => {}, error: () => {} }

const fakeModel: Adapter = async (_provider, request) => {
  calls.push(request)
  const [file] = request.attachments ?? []
  let text = 'FB50 | Enter G/L Account Document'
  if (file?.mediaType === 'application/pdf') {
    const pages = (await PDFDocument.load(file.data)).getPageCount()
    text = Array.from({ length: pages }, (_, i) => `=== Page ${i + 1} ===\nScanned text on batch page ${i + 1}`).join('\n')
  }
  return { text, model: 'fake-ocr', inputTokens: 100, outputTokens: 20 }
}
const handlers = makeHandlers({
  adapters: { anthropic: fakeModel },
  scanVerdict: async () => null,
  readBlob: async (path) => blobs.get(path) ?? Buffer.from(''),
})

let allowed: string, notAllowed: string, cta: string, ctaNotAllowed: string

async function member(client: string, email: string) {
  const id = await makeProfile(pglite, email)
  await sql(pglite, `insert into client_memberships (client_id, profile_id, roles) values ($1, $2, '{client_training_admin}')`, [client, id])
  return id
}

async function uploadAndProcess(who: string, client: string, filename: string, content: Buffer) {
  const [file] = await as(pglite, who)('select * from start_upload($1, $2, null, $3)', [client, filename, content.length])
  blobs.set(file.blob_path, content)
  let assetId = ''
  await pglite.transaction(async (tx) => {
    await tx.query('set local role service_role')
    assetId = ((await tx.query('select id from complete_upload($1, $2, $3)', [file.id, content.length, randomBytes(32).toString('hex')])).rows[0] as { id: string }).id
  })
  while ((await runOnce(db, 'w', handlers, { log: quiet })) > 0) {}
  const [version] = await sql(pglite,
    `select v.extraction_status, v.extraction_detail from knowledge_asset_versions v join knowledge_assets a on a.current_version_id = v.id where a.id = $1`,
    [assetId])
  const chunks = await sql(pglite, 'select locator, text from source_chunks where asset_id = $1 order by ordinal', [assetId])
  return { version, chunks }
}

async function pdf(pages: string[]): Promise<Buffer> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (const text of pages) {
    const page = doc.addPage()
    if (text) page.drawText(text, { x: 50, y: 700, size: 12, font })
  }
  return Buffer.from(await doc.save())
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
  ;[{ id: allowed }] = await sql(pglite, `insert into clients (name, slug, allowed_ai_providers) values ('Allowed', 'a', $1) returning id`, [[provider.id]])
  ;[{ id: notAllowed }] = await sql(pglite, `insert into clients (name, slug) values ('Not allowed', 'n') returning id`)
  cta = await member(allowed, 'cta@a.example')
  ctaNotAllowed = await member(notAllowed, 'cta@n.example')
})

beforeEach(() => {
  calls = []
})

describe('reading images and scans', () => {
  it('transcribes an image through the gateway, at low effort, as the uploader', async () => {
    const { version, chunks } = await uploadAndProcess(cta, allowed, 'screen.png', Buffer.from([0x89, 0x50, 0x4e, 0x47]))
    expect(version).toEqual({ extraction_status: 'done', extraction_detail: 'Text read from the image by AI.' })
    expect(chunks).toEqual([{ locator: { ocr: 'image' }, text: 'FB50 | Enter G/L Account Document' }])
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ purpose: 'ocr', effort: 'low', classification: 'client_confidential', clientId: allowed })
    expect(calls[0].attachments?.[0].mediaType).toBe('image/png')

    const [logged] = await sql(pglite, `select outcome, requested_by, model from ai_calls where purpose = 'ocr' order by created_at desc limit 1`)
    expect(logged).toEqual({ outcome: 'succeeded', requested_by: cta, model: 'fake-ocr' })
  })

  it('sends only the scanned pages of a mixed PDF and keeps page order', async () => {
    const { version, chunks } = await uploadAndProcess(cta, allowed, 'mixed.pdf',
      await pdf(['Typed page one about accruals.', '', 'Typed page three about reversals.']))
    expect(version.extraction_status).toBe('done')
    expect(version.extraction_detail).toBe('Read 2 pages; 1 scanned page read by AI.')
    expect(chunks.map((c) => c.locator)).toEqual([{ page: 1 }, { page: 2, ocr: 'page' }, { page: 3 }])
    expect(chunks[1].text).toBe('Scanned text on batch page 1')
    // The model saw a one-page PDF holding just page 2.
    expect(await PDFDocument.load(calls[0].attachments![0].data).then((d) => d.getPageCount())).toBe(1)
  })

  it('reads a fully scanned PDF in batches of ten pages', async () => {
    const { version, chunks } = await uploadAndProcess(cta, allowed, 'scan.pdf', await pdf(Array(12).fill('')))
    expect(version.extraction_detail).toBe('12 scanned pages read by AI.')
    expect(calls).toHaveLength(2)
    expect(chunks.map((c) => c.locator.page)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
    expect(chunks[10].text).toBe('Scanned text on batch page 1')
  })

  it("leaves scans unread, with the reason, when the client hasn't allowed an AI provider", async () => {
    const { version, chunks } = await uploadAndProcess(ctaNotAllowed, notAllowed, 'screen.jpg', Buffer.from([0xff, 0xd8]))
    expect(calls).toHaveLength(0)
    expect(chunks).toEqual([])
    expect(version.extraction_status).toBe('needs_ocr')
    expect(version.extraction_detail).toMatch(/weren't read: No enabled AI provider is allowed/)
  })
})

describe('splitByPage', () => {
  it('maps batch page markers back to the original page numbers', () => {
    expect(splitByPage('=== Page 1 ===\nfirst\n=== Page 2 ===\nsecond', [4, 9])).toEqual([
      { text: 'first', locator: { page: 4, ocr: 'page' } },
      { text: 'second', locator: { page: 9, ocr: 'page' } },
    ])
  })

  it('keeps unmarked text, attributed to the first page', () => {
    expect(splitByPage('no markers here', [7])).toEqual([{ text: 'no markers here', locator: { page: 7, ocr: 'page' } }])
  })
})
