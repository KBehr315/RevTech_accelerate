// Background job queue (00101): who can see and create jobs, and how the
// worker claims, finishes and retries them.

import { beforeAll, describe, expect, it } from 'vitest';
import { as, createDb, makeProfile, sql } from './harness.js';

let db;
const p = {};

/* Run as the `worker` role, the way the worker's login does. */
const asWorker = text => db.transaction(async tx => {
  await tx.query('set local role worker');
  return (await tx.query(text)).rows;
});

beforeAll(async () => {
  db = await createDb();
  for (const name of ['admin', 'cta', 'stranger']) p[name] = await makeProfile(db, `${name}@example.com`);
  await sql(db, `insert into platform_role_grants (profile_id, role) values ($1, 'platform_admin')`, [p.admin]);
});

describe('creating and seeing jobs', () => {
  it('only platform admins can request a health check', async () => {
    await expect(as(db, p.stranger)('select request_health_check()')).rejects.toThrow(/Only a Platform Administrator/);
    const [job] = await as(db, p.admin)('select * from request_health_check()');
    expect(job).toMatchObject({ kind: 'health_check', status: 'queued', requested_by: p.admin });
  });

  it('nobody can enqueue or write jobs directly', async () => {
    await expect(as(db, p.admin)(`select enqueue_job('anything', null)`)).rejects.toThrow(/permission denied/);
    await expect(as(db, p.admin)(`insert into jobs (kind) values ('forged')`)).rejects.toThrow();
    await expect(as(db, p.admin)(`update jobs set status = 'succeeded'`)).rejects.toThrow(/permission denied/);
  });

  it('platform jobs are visible to platform admins only', async () => {
    expect((await as(db, p.admin)('select id from jobs')).length).toBe(1);
    expect(await as(db, p.stranger)('select id from jobs')).toEqual([]);
  });

  it('signed-in users cannot call the worker functions', async () => {
    await expect(as(db, p.admin)(`select * from claim_jobs('me')`)).rejects.toThrow(/permission denied/);
  });
});

describe('worker lifecycle', () => {
  it('claims, finishes, and does not hand the same job out twice', async () => {
    const [claimed] = await asWorker(`select * from claim_jobs('w1', 5)`);
    expect(claimed).toMatchObject({ status: 'running', attempts: 1, locked_by: 'w1' });
    expect(await asWorker(`select * from claim_jobs('w2', 5)`)).toEqual([]);

    // Another worker can't finish a job it doesn't hold.
    await asWorker(`select finish_job('${claimed.id}', 'w2', '{}')`);
    expect((await sql(db, 'select status from jobs where id = $1', [claimed.id]))[0].status).toBe('running');

    await asWorker(`select finish_job('${claimed.id}', 'w1', '{"ok": true}')`);
    const [done] = await sql(db, 'select * from jobs where id = $1', [claimed.id]);
    expect(done).toMatchObject({ status: 'succeeded', result: { ok: true }, locked_by: null });
    expect(done.finished_at).not.toBeNull();
  });

  it('retries with backoff, then fails for good', async () => {
    const [{ id }] = await sql(db, `insert into jobs (kind, max_attempts) values ('flaky', 2) returning id`);
    await asWorker(`select * from claim_jobs('w1')`);
    await asWorker(`select fail_job('${id}', 'w1', 'boom')`);
    let [job] = await sql(db, 'select * from jobs where id = $1', [id]);
    expect(job).toMatchObject({ status: 'queued', last_error: 'boom', attempts: 1 });
    expect(new Date(job.run_after).getTime()).toBeGreaterThan(Date.now() + 30_000);

    await sql(db, 'update jobs set run_after = now() where id = $1', [id]);
    await asWorker(`select * from claim_jobs('w1')`);
    await asWorker(`select fail_job('${id}', 'w1', 'boom again')`);
    [job] = await sql(db, 'select * from jobs where id = $1', [id]);
    expect(job).toMatchObject({ status: 'failed', attempts: 2, last_error: 'boom again' });
  });

  it('reclaims jobs whose worker went away', async () => {
    const [{ id }] = await sql(db, `insert into jobs (kind, status, locked_by, locked_at, attempts)
      values ('stuck', 'running', 'dead', now() - interval '1 hour', 1) returning id`);
    const claimed = await asWorker(`select * from claim_jobs('w3')`);
    expect(claimed.map(j => j.id)).toContain(id);
  });
});
