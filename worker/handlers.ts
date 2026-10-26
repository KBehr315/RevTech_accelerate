// One handler per job kind. Each phase of the roadmap adds its own here
// (source extraction, generation, rendering, reminders, …).

import type { Handler } from './queue.ts'

export const handlers: Record<string, Handler> = {
  /** Confirms the worker can reach the database and act as the requester. */
  health_check: async (job, { asRequester, workerId }) => {
    const [row] = await asRequester(async (tx) =>
      (await tx.query<{ now: string; is_admin: boolean }>('select now() as now, public.is_platform_admin() as is_admin')).rows,
    )
    return {
      worker: workerId,
      database_time: row.now,
      acted_as_requester: row.is_admin,
      node: process.version,
    }
  },
}
