// The demo seeds in db/seeds apply cleanly on top of every migration, can be
// re-run, leave clients that pass activation, and stay out of each other's way.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { as, createDb, sql } from './harness.js';

const SEEDS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'seeds');
let db;

beforeAll(async () => {
  db = await createDb();
  const files = (await fs.readdir(SEEDS_DIR)).filter(f => f.endsWith('.sql')).sort();
  for (let run = 0; run < 2; run++) { // a second run must change nothing
    for (const file of files) await db.exec(await fs.readFile(path.join(SEEDS_DIR, file), 'utf8'));
  }
});

const clientId = async slug => (await sql(db, 'select id from clients where slug = $1', [slug]))[0].id;
const profileId = async email => (await sql(db, 'select id from profiles where email = $1', [email]))[0].id;
const count = async (table, client) =>
  (await sql(db, `select count(*)::int as n from ${table} where client_id = $1`, [client]))[0].n;

describe('demo seeds', () => {
  it.each([
    ['meridian-aerostructures', { client_workstreams: 2, client_business_roles: 5, client_terms: 7, client_memberships: 6 }],
    ['calder-defense-systems', { client_workstreams: 1, client_business_roles: 2, client_terms: 2, client_memberships: 3 }],
  ])('creates %s once, with its setup and members', async (slug, expected) => {
    expect(await sql(db, 'select 1 from clients where slug = $1', [slug])).toHaveLength(1);
    const id = await clientId(slug);
    for (const [table, n] of Object.entries(expected)) expect(await count(table, id), table).toBe(n);
  });

  it.each(['meridian-aerostructures', 'calder-defense-systems'])(
    'makes Kelly Client Training Administrator of %s, and it would pass activation',
    async slug => {
      const id = await clientId(slug);
      // Back to setup, then activate the normal way: it must report nothing missing.
      await sql(db, `update clients set status = 'setup' where id = $1`, [id]);
      const [activated] = await as(db, await profileId('kbehringer@revtech.consulting'))('select * from activate_client($1)', [id]);
      expect(activated.status).toBe('active');
    },
  );

  it('keeps each client\'s people out of the other client', async () => {
    const meridian = await clientId('meridian-aerostructures');
    const calder = await clientId('calder-defense-systems');
    const dana = await as(db, await profileId('dana.whitfield@meridian-aero.example'));
    const sam = await as(db, await profileId('sam.okafor@calder-defense.example'));

    for (const table of ['client_workstreams', 'client_business_roles', 'client_terms', 'client_memberships']) {
      expect(await dana(`select * from ${table} where client_id = $1`, [calder]), table).toHaveLength(0);
      expect(await sam(`select * from ${table} where client_id = $1`, [meridian]), table).toHaveLength(0);
    }
    expect((await dana('select slug from clients')).map(c => c.slug)).toEqual(['meridian-aerostructures']);
    expect((await sam('select slug from clients')).map(c => c.slug)).toEqual(['calder-defense-systems']);
  });

  it('uses only reserved .example addresses for its people', async () => {
    const people = await sql(db, `select email from profiles where email like '%@meridian-aero%' or email like '%@calder-defense%'`);
    expect(people).toHaveLength(7);
    for (const { email } of people) expect(email).toMatch(/\.example$/);
  });
});
