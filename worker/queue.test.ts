// The worker loop against a real (PGlite) database with every migration applied.

import { beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { as, createDb, makeProfile, sql } from '../db/tests/harness.js'
import { handlers } from './handlers.ts'
import { runOnce, type Db } from './queue.ts'

let pglite: PGlite
let db: Db
const quiet = { info: () => {}, error: () => {} }

beforeAll(async () => {
  pglite = await createDb()
  const wrap = (q: Pick<PGlite, 'query'>): Db => ({
    query: (text, params) => q.query(text, params) as never,
    transaction: (fn) => pglite.transaction((tx) => fn(wrap(tx))),
  })
  db = wrap(pglite)
})

describe('runOnce', () => {
  it('runs a health check as the requester and records the result', async () => {
    const admin = await makeProfile(pglite, 'admin@example.com')
    await sql(pglite, `insert into platform_role_grants (profile_id, role) values ($1, 'platform_admin')`, [admin])
    const [job] = await as(pglite, admin)('select * from request_health_check()')

    expect(await runOnce(db, 'test-worker', handlers, { log: quiet })).toBe(1)

    const [done] = await sql(pglite, 'select status, result from jobs where id = $1', [job.id])
    expect(done.status).toBe('succeeded')
    // is_platform_admin() was true, so the handler really ran as the requester.
    expect(done.result).toMatchObject({ worker: 'test-worker', acted_as_requester: true })
  })

  it('records a failure for an unknown job kind and schedules a retry', async () => {
    const [{ id }] = await sql(pglite, `insert into jobs (kind) values ('no_such_kind') returning id`)
    await runOnce(db, 'test-worker', handlers, { log: quiet })
    const [job] = await sql(pglite, 'select status, last_error from jobs where id = $1', [id])
    expect(job).toMatchObject({ status: 'queued', last_error: 'No handler for job kind "no_such_kind".' })
  })

  it('does nothing when the queue is empty', async () => {
    expect(await runOnce(db, 'test-worker', handlers, { log: quiet })).toBe(0)
  })
})
