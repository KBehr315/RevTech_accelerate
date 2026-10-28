// Background worker: polls public.jobs and runs each job's handler.
//
// Runs as its own Container App from the same image as the API
// (command: node worker/index.ts). It connects directly to Postgres as
// accelerate_worker, which may only claim/finish/fail jobs (`worker` role) or
// act for a job's requester (`authenticated`, see queue.ts).
//
//   DATABASE_URL   connection string for accelerate_worker
//   WORKER_ID      optional; defaults to the container's hostname

import os from 'node:os'
import pg from 'pg'
import { handlers } from './handlers.ts'
import { runOnce, type Db } from './queue.ts'

const POLL_MS = 2_000
const workerId = process.env.WORKER_ID || os.hostname()

if (!process.env.DATABASE_URL) {
  console.error('Startup failed: missing DATABASE_URL')
  process.exit(1)
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: true }, max: 4 })
// Every connection starts as `worker`; asProfile() switches to `authenticated`
// inside a transaction when a job acts for its requester.
pool.on('connect', (client) => {
  client.query('set role worker').catch((err: Error) => console.error(`set role failed: ${err.message}`))
})

/** pg's results typed as the Db interface expects (rows are whatever the SQL selects). */
const typed =
  (q: (text: string, params?: unknown[]) => Promise<pg.QueryResult>) =>
  async <T,>(text: string, params?: unknown[]) =>
    (await q(text, params)) as unknown as { rows: T[] }

const db: Db = {
  query: typed((text, params) => pool.query(text, params)),
  transaction: async (fn) => {
    const client = await pool.connect()
    const tx: Db = { query: typed((text, params) => client.query(text, params)), transaction: (inner) => inner(tx) }
    try {
      await client.query('begin')
      const result = await fn(tx)
      await client.query('commit')
      return result
    } catch (err) {
      await client.query('rollback')
      throw err
    } finally {
      client.release()
    }
  },
}

let stopping = false
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    console.log(`${signal}: finishing the current job, then stopping`)
    stopping = true
  })
}

console.log(`worker ${workerId} started; handles ${Object.keys(handlers).join(', ')}`)
while (!stopping) {
  try {
    const ran = await runOnce(db, workerId, handlers)
    if (ran === 0) await new Promise((resolve) => setTimeout(resolve, POLL_MS))
  } catch (err) {
    console.error(`poll failed: ${(err as Error).message}`)
    await new Promise((resolve) => setTimeout(resolve, POLL_MS * 5))
  }
}
await pool.end()
console.log('worker stopped')
