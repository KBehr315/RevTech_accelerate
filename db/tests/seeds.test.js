// The demo seeds in db/seeds apply cleanly on top of every migration, can be
// re-run, and leave a client that passes activation.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { as, createDb, sql } from './harness.js';

const SEED = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'seeds', 'meridian-aerostructures.sql');
let db;

beforeAll(async () => {
  db = await createDb();
  const seed = await fs.readFile(SEED, 'utf8');
  await db.exec(seed);
  await db.exec(seed); // a second run must change nothing
});

describe('Meridian Aerostructures seed', () => {
  it('creates one active client with FI and CO, roles, terms and members', async () => {
    const clients = await sql(db, `select * from clients where slug = 'meridian-aerostructures'`);
    expect(clients).toHaveLength(1);
    const [client] = clients;
    expect(client.status).toBe('active');

    const counts = async table => (await sql(db, `select count(*)::int as n from ${table} where client_id = $1`, [client.id]))[0].n;
    expect(await counts('client_workstreams')).toBe(2);
    expect(await counts('client_business_roles')).toBe(5);
    expect(await counts('client_terms')).toBe(7);
    expect(await counts('client_memberships')).toBe(6);
  });

  it('makes Kelly its Client Training Administrator, and the client would pass activation', async () => {
    const [kelly] = await sql(db, `select id from profiles where email = 'kbehringer@revtech.consulting'`);
    const [client] = await sql(db, `select id from clients where slug = 'meridian-aerostructures'`);
    // Back to setup, then activate the normal way: it must report nothing missing.
    await sql(db, `update clients set status = 'setup' where id = $1`, [client.id]);
    const [activated] = await as(db, kelly.id)('select * from activate_client($1)', [client.id]);
    expect(activated.status).toBe('active');
  });

  it('uses only reserved .example addresses for its people', async () => {
    const people = await sql(db, `select email from profiles where email like '%meridian%'`);
    expect(people.length).toBe(5);
    for (const { email } of people) expect(email).toMatch(/@meridian-aero\.example$/);
  });
});
