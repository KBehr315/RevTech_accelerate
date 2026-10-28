// The scan_file job against a real (PGlite) database, with a stand-in for Defender.

import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { as, createDb, makeProfile, sql } from '../db/tests/harness.js'
import { makeHandlers } from './handlers.ts'
import { runOnce, type Db } from './queue.ts'

let pglite: PGlite
let db: Db
let cta: string
let client: string
let verdict: 'clean' | 'infected' | 'failed' | null
const quiet = { info: () => {}, error: () => {} }
const handlers = makeHandlers({ adapters: {}, scanVerdict: async () => verdict, readBlob: async () => Buffer.from('') })

beforeAll(async () => {
  pglite = await createDb()
  const wrap = (q: Pick<PGlite, 'query'>): Db => ({
    query: (text, params) => q.query(text, params) as never,
    transaction: (fn) => pglite.transaction((tx) => fn(wrap(tx))),
  })
  db = wrap(pglite)
  ;[{ id: client }] = await sql(pglite, `insert into clients (name, slug) values ('Scan', 'scan') returning id`)
  cta = await makeProfile(pglite, 'cta@scan.example')
  await sql(pglite, `insert into client_memberships (client_id, profile_id, roles) values ($1, $2, '{client_training_admin}')`, [client, cta])
})

beforeEach(async () => {
  await sql(pglite, `delete from jobs`)
})

/** Uploads a file the way the API server does and returns its id. */
async function uploaded(name: string): Promise<string> {
  const [file] = await as(pglite, cta)('select * from start_upload($1, $2, null, 10)', [client, name])
  await pglite.transaction(async (tx) => {
    await tx.query('set local role service_role')
    await tx.query('select complete_upload($1, 10, $2)', [file.id, 'ef'.repeat(32)])
  })
  return file.id
}

const scanStatus = async (fileId: string) =>
  (await sql(pglite, 'select scan_status from source_files where id = $1', [fileId]))[0].scan_status

describe('scan_file', () => {
  it('marks files not_scanned when scanning is off', async () => {
    await sql(pglite, `update platform_settings set malware_scanning = 'off'`)
    const id = await uploaded('off.docx')
    await runOnce(db, 'w', handlers, { log: quiet })
    expect(await scanStatus(id)).toBe('not_scanned')
    await sql(pglite, `update platform_settings set malware_scanning = 'defender'`)
  })

  it('keeps waiting while Defender has no verdict, then records it', async () => {
    const id = await uploaded('wait.docx')
    verdict = null
    await runOnce(db, 'w', handlers, { log: quiet })
    expect(await scanStatus(id)).toBe('pending')
    const [job] = await sql(pglite, `select status, attempts, last_error from jobs where kind = 'scan_file'`)
    expect(job).toMatchObject({ status: 'queued', attempts: 1 })
    expect(job.last_error).toMatch(/No malware scan result yet/)

    verdict = 'clean'
    await sql(pglite, `update jobs set run_after = now()`)
    await runOnce(db, 'w', handlers, { log: quiet })
    expect(await scanStatus(id)).toBe('clean')
  })

  it('records an infected verdict', async () => {
    const id = await uploaded('bad.docx')
    verdict = 'infected'
    await runOnce(db, 'w', handlers, { log: quiet })
    expect(await scanStatus(id)).toBe('infected')
  })
})
