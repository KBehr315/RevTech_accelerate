// "View as" (00110): a Platform Administrator previewing one client role sees
// what that role sees, and nobody else can use the claim.

import { randomBytes } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { as, createDb, makeProfile, sql } from './harness.js';

let db;
let meridian, calder;
let kelly, cta, gka;
let draft;

/* Like as(), with the view_as claim the API server adds while previewing. */
function previewing(profileId, clientId, role) {
  return async (text, params = []) => db.transaction(async tx => {
    await tx.query('set local role authenticated');
    await tx.query(`select set_config('request.jwt.claims', $1, true)`,
      [JSON.stringify({ role: 'authenticated', sub: profileId, view_as: { client_id: clientId, role } })]);
    return (await tx.query(text, params)).rows;
  });
}

const clientNames = async (query) => (await query('select name from clients order by name')).map(r => r.name);

beforeAll(async () => {
  db = await createDb();
  [{ id: meridian }] = await sql(db, `insert into clients (name, slug) values ('Meridian', 'meridian') returning id`);
  [{ id: calder }] = await sql(db, `insert into clients (name, slug) values ('Calder', 'calder') returning id`);
  // Like Kelly: Platform Administrator, Global Knowledge Administrator, and Meridian's Training Administrator.
  kelly = await makeProfile(db, 'kelly@revtech.example');
  await sql(db, `insert into platform_role_grants (profile_id, role) values ($1, 'platform_admin'), ($1, 'global_knowledge_admin')`, [kelly]);
  await sql(db, `insert into client_memberships (client_id, profile_id, roles) values ($1, $2, '{client_training_admin}')`, [meridian, kelly]);
  cta = await makeProfile(db, 'cta@meridian.example');
  await sql(db, `insert into client_memberships (client_id, profile_id, roles) values ($1, $2, '{client_training_admin}')`, [meridian, cta]);
  gka = await makeProfile(db, 'gka@revtech.example');
  await sql(db, `insert into platform_role_grants (profile_id, role) values ($1, 'global_knowledge_admin')`, [gka]);

  const [file] = await as(db, cta)('select * from start_upload($1, $2, null, 100)', [meridian, 'Close guide.docx']);
  [draft] = await db.transaction(async tx => {
    await tx.query('set local role service_role');
    return (await tx.query('select * from complete_upload($1, 100, $2)', [file.id, randomBytes(32).toString('hex')])).rows;
  });
});

describe('previewing as a learner', () => {
  it('drops platform roles and keeps only the learner role in that client', async () => {
    const view = previewing(kelly, meridian, 'learner');
    expect(await view('select is_platform_admin() as p, is_global_knowledge_admin() as g')).toEqual([{ p: false, g: false }]);
    expect(await view('select client_roles($1) as r', [meridian])).toEqual([{ r: ['learner'] }]);
    expect(await view('select client_roles($1) as r', [calder])).toEqual([{ r: [] }]);
    expect(await clientNames(view)).toEqual(['Meridian']);
  });

  it("hides the client's source documents, which Kelly normally sees", async () => {
    expect(await as(db, kelly)('select id from knowledge_assets where id = $1', [draft.id])).toHaveLength(1);
    expect(await previewing(kelly, meridian, 'learner')('select id from knowledge_assets where id = $1', [draft.id])).toEqual([]);
  });

  it('works for a client Kelly does not belong to', async () => {
    const view = previewing(kelly, calder, 'learner');
    expect(await clientNames(view)).toEqual(['Calder']);
  });
});

describe('the claim', () => {
  it('is ignored from anyone who is not a Platform Administrator', async () => {
    const view = previewing(gka, calder, 'client_training_admin');
    expect(await view('select is_global_knowledge_admin() as g, client_roles($1) as r', [calder])).toEqual([{ g: true, r: [] }]);
    expect(await view('select * from preview_role()')).toEqual([]);
    // A Training Administrator can't use it to drop into another client either.
    expect(await clientNames(previewing(cta, calder, 'client_training_admin'))).toEqual(['Meridian']);
  });

  it('changes nothing for ordinary requests', async () => {
    expect(await clientNames(as(db, kelly))).toEqual(['Calder', 'Meridian']);
    expect(await as(db, kelly)('select client_roles($1) as r', [meridian])).toEqual([{ r: ['client_training_admin'] }]);
  });
});

describe('starting a preview', () => {
  it('is recorded, and only Platform Administrators may', async () => {
    await as(db, kelly)(`select start_preview($1, 'learner')`, [calder]);
    const [event] = await sql(db, `select actor_id, client_id, details from audit_events where action = 'preview.start'`);
    expect(event).toMatchObject({ actor_id: kelly, client_id: calder, details: { role: 'learner' } });
    await expect(as(db, gka)(`select start_preview($1, 'learner')`, [calder])).rejects.toThrow(/Only Platform Administrators/);
  });
});
