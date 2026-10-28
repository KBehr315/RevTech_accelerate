// Claims jobs from public.jobs (db/migrations/00101) and runs their handlers.
//
// Database access goes through `Db`, a two-method interface that both pg (in
// Azure) and PGlite (in tests) satisfy, so the same code is tested as deployed.

export interface Db {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: T[] }>
  /** Runs fn in one transaction on one connection. */
  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>
}

export interface Job {
  id: string
  kind: string
  client_id: string | null
  requested_by: string | null
  payload: Record<string, unknown>
  attempts: number
  max_attempts: number
}

export interface JobContext {
  db: Db
  workerId: string
  /**
   * Runs fn as the person who requested the job: the `authenticated` role with
   * their id in request.jwt.claims, exactly as PostgREST would. RLS then limits
   * the job to what that person could do themselves.
   */
  asRequester<T>(fn: (tx: Db) => Promise<T>): Promise<T>
}

export type Handler = (job: Job, ctx: JobContext) => Promise<Record<string, unknown> | void>

export function asProfile<T>(db: Db, profileId: string, fn: (tx: Db) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.query('set local role authenticated')
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ role: 'authenticated', sub: profileId }),
    ])
    return fn(tx)
  })
}

/** Claims up to `limit` ready jobs and runs them. Returns how many ran. */
export async function runOnce(
  db: Db,
  workerId: string,
  handlers: Record<string, Handler>,
  { limit = 1, log = console } = {},
): Promise<number> {
  const { rows: jobs } = await db.query<Job>('select * from public.claim_jobs($1, $2)', [workerId, limit])

  for (const job of jobs) {
    const started = Date.now()
    const ctx: JobContext = {
      db,
      workerId,
      asRequester: (fn) => {
        if (!job.requested_by) throw new Error(`Job ${job.id} has no requester to act as.`)
        return asProfile(db, job.requested_by, fn)
      },
    }
    try {
      const handler = handlers[job.kind]
      if (!handler) throw new Error(`No handler for job kind "${job.kind}".`)
      const result = (await handler(job, ctx)) ?? {}
      await db.query('select public.finish_job($1, $2, $3)', [job.id, workerId, JSON.stringify(result)])
      log.info(`job ${job.id} ${job.kind} succeeded in ${Date.now() - started} ms`)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      await db.query('select public.fail_job($1, $2, $3)', [job.id, workerId, message])
      log.error(`job ${job.id} ${job.kind} failed (attempt ${job.attempts} of ${job.max_attempts}): ${message}`)
    }
  }
  return jobs.length
}
