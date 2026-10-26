// Isolation and permission tests for 00100 (identity, clients, roles, audit).
// Every client-owned table must be invisible and unwritable to anyone who is
// not an active member of that client, whatever platform roles they hold.

import { beforeAll, describe, expect, it } from 'vitest';
import { as, createDb, makeProfile, sql } from './harness.js';

let db;
const p = {};       // profile ids by persona
const c = {};       // client ids

beforeAll(async () => {
  db = await createDb();

  for (const name of ['ctaA', 'lmsA', 'contribA', 'learnerA', 'ctaB', 'platformAdmin', 'gka', 'stranger', 'creator', 'inactiveA']) {
    p[name] = await makeProfile(db, `${name.toLowerCase()}@example.com`, name);
  }
  await sql(db, `insert into platform_role_grants (profile_id, role) values
    ($1, 'platform_admin'), ($2, 'global_knowledge_admin'), ($3, 'client_creator')`,
    [p.platformAdmin, p.gka, p.creator]);

  [{ id: c.A }] = await as(db, p.platformAdmin)(`select id from create_client('Client A', 'client-a')`);
  [{ id: c.B }] = await as(db, p.platformAdmin)(`select id from create_client('Client B', 'client-b')`);

  // The creating Platform Administrator became each client's first CTA; hand
  // the clients to their own CTAs and remove the platform admin, so the
  // "platform role without membership" cases below are real.
  await sql(db, `insert into client_memberships (client_id, profile_id, roles) values
    ($1, $3, '{client_training_admin}'), ($1, $4, '{lms_admin}'), ($1, $5, '{contributor}'),
    ($1, $6, '{learner}'), ($1, $7, '{client_training_admin}'), ($2, $8, '{client_training_admin}')`,
    [c.A, c.B, p.ctaA, p.lmsA, p.contribA, p.learnerA, p.inactiveA, p.ctaB]);
  await sql(db, `delete from client_memberships where profile_id = $1`, [p.platformAdmin]);
  await sql(db, `update profiles set is_active = false where id = $1`, [p.inactiveA]);

  for (const [client, cta] of [[c.A, p.ctaA], [c.B, p.ctaB]]) {
    const q = as(db, cta);
    await q(`insert into client_workstreams (client_id, code, name) values ($1, 'FI', 'Finance')`, [client]);
    await q(`insert into client_business_roles (client_id, name) values ($1, 'GL Accountant')`, [client]);
    await q(`insert into client_terms (client_id, client_term, standard_term) values ($1, 'JE', 'Journal Entry')`, [client]);
  }
  const [{ id: wsA }] = await sql(db, `select id from client_workstreams where client_id = $1`, [c.A]);
  await as(db, p.ctaA)(`insert into work_grants (client_id, profile_id, capacity, target_type, target_id)
    values ($1, $2, 'contributor', 'workstream', $3)`, [c.A, p.contribA, wsA]);
});

const CLIENT_TABLES = ['client_workstreams', 'client_business_roles', 'client_terms', 'client_memberships', 'work_grants'];

async function visibleClientIds(profileId, table) {
  const rows = await as(db, profileId)(`select distinct client_id from ${table}`);
  return rows.map(r => r.client_id).sort();
}

describe('client isolation', () => {
  it.each(CLIENT_TABLES)('a member of A never sees B in %s', async table => {
    for (const persona of ['ctaA', 'lmsA', 'contribA', 'learnerA']) {
      const ids = await visibleClientIds(p[persona], table);
      expect(ids, persona).not.toContain(c.B);
    }
  });

  it.each(CLIENT_TABLES)('platform roles without membership see nothing in %s', async table => {
    for (const persona of ['gka', 'stranger', 'creator']) {
      expect(await visibleClientIds(p[persona], table), persona).toEqual([]);
    }
    // Platform Administrators may manage memberships but see no client content.
    if (table !== 'client_memberships') {
      expect(await visibleClientIds(p.platformAdmin, table)).toEqual([]);
    }
  });

  it.each(['client_workstreams', 'client_business_roles', 'client_terms', 'work_grants'])(
    'a deactivated profile sees nothing in %s', async table => {
      expect(await visibleClientIds(p.inactiveA, table)).toEqual([]);
    });

  it('members see only their own client records', async () => {
    const rows = await as(db, p.learnerA)('select id from clients');
    expect(rows.map(r => r.id)).toEqual([c.A]);
    expect(await as(db, p.stranger)('select id from clients')).toEqual([]);
  });

  it('A cannot write into B', async () => {
    const q = as(db, p.ctaA);
    await expect(q(`insert into client_workstreams (client_id, code, name) values ($1, 'CO', 'x')`, [c.B])).rejects.toThrow();
    await expect(q(`insert into work_grants (client_id, profile_id, capacity, target_type, target_id)
      values ($1, $2, 'reviewer', 'module', gen_random_uuid())`, [c.B, p.ctaB])).rejects.toThrow();
    const updated = await q(`update clients set name = 'hijacked' where id = $1 returning id`, [c.B]);
    expect(updated).toEqual([]);
    const deleted = await q(`delete from client_terms where client_id = $1 returning id`, [c.B]);
    expect(deleted).toEqual([]);
  });

  it('profiles are visible only to self, platform admins, and the admins of a shared client', async () => {
    const seen = async who => (await as(db, p[who])('select id from profiles')).map(r => r.id);
    expect(await seen('stranger')).toEqual([p.stranger]);
    expect(await seen('learnerA')).toEqual([p.learnerA]);
    expect(await seen('ctaA')).toContain(p.learnerA);
    expect(await seen('ctaA')).not.toContain(p.ctaB);
    expect(await seen('platformAdmin')).toContain(p.ctaB);
  });
});

describe('roles within a client', () => {
  it('learners and contributors read setup data but cannot change it', async () => {
    for (const persona of ['learnerA', 'contribA', 'lmsA']) {
      const q = as(db, p[persona]);
      expect((await q('select id from client_terms')).length, persona).toBe(1);
      await expect(q(`insert into client_terms (client_id, client_term) values ($1, 'x')`, [c.A]), persona).rejects.toThrow();
      expect(await q(`update clients set name = 'x' where id = $1 returning id`, [c.A]), persona).toEqual([]);
    }
  });

  it('a contributor sees their own work grants only', async () => {
    expect((await as(db, p.contribA)('select profile_id from work_grants')).map(r => r.profile_id)).toEqual([p.contribA]);
    expect(await as(db, p.learnerA)('select * from work_grants')).toEqual([]);
  });

  it('LMS administrators may add learners and nothing else', async () => {
    const q = as(db, p.lmsA);
    const [m] = await q(`select * from add_client_member($1, 'new.learner@client.example', 'New Learner', '{learner}')`, [c.A]);
    expect(m.roles).toEqual(['learner']);
    await expect(q(`select add_client_member($1, 'x@client.example', 'X', '{contributor}')`, [c.A])).rejects.toThrow(/cannot add/);
    await expect(q(`select set_client_roles($1, $2, '{learner,reviewer}')`, [c.A, p.learnerA])).rejects.toThrow(/cannot change/);
    await expect(q(`select add_client_member($1, 'y@client.example', 'Y', '{learner}')`, [c.B])).rejects.toThrow();
  });

  it('re-adding an ended membership does not revive old roles', async () => {
    const q = as(db, p.ctaA);
    await q(`select add_client_member($1, 'leaver@example.com', 'Leaver', '{contributor}')`, [c.A]);
    const [{ id }] = await sql(db, `select id from profiles where email = 'leaver@example.com'`);
    await q(`select set_client_roles($1, $2, '{}')`, [c.A, id]);
    const [m] = await as(db, p.lmsA)(`select * from add_client_member($1, 'leaver@example.com', 'Leaver', '{learner}')`, [c.A]);
    expect(m.roles).toEqual(['learner']);
  });

  it('client admins cannot remove their own CTA role', async () => {
    await expect(as(db, p.ctaA)(`select set_client_roles($1, $2, '{learner}')`, [c.A, p.ctaA])).rejects.toThrow(/your own/);
  });

  it('guests are marked as guests when added', async () => {
    const [prof] = await sql(db, `select is_guest from profiles where email = 'new.learner@client.example'`);
    expect(prof.is_guest).toBe(true);
  });
});

describe('platform roles', () => {
  it('only platform admins and client creators can create clients; creators become CTA', async () => {
    await expect(as(db, p.ctaA)(`select create_client('Nope', 'nope')`)).rejects.toThrow(/Only a Platform Administrator/);
    const [client] = await as(db, p.creator)(`select * from create_client('Created', 'created')`);
    const [{ roles }] = await as(db, p.creator)(`select client_roles($1) as roles`, [client.id]);
    expect(roles).toEqual(['client_training_admin']);
  });

  it('only platform admins grant platform roles, and cannot drop their own admin role', async () => {
    await expect(as(db, p.gka)(`select set_platform_role($1, 'platform_admin', true)`, [p.gka])).rejects.toThrow();
    await as(db, p.platformAdmin)(`select set_platform_role($1, 'global_knowledge_admin', true)`, [p.stranger]);
    expect(await as(db, p.stranger)('select role from platform_role_grants')).toEqual([{ role: 'global_knowledge_admin' }]);
    await as(db, p.platformAdmin)(`select set_platform_role($1, 'global_knowledge_admin', false)`, [p.stranger]);
    await expect(as(db, p.platformAdmin)(`select set_platform_role($1, 'platform_admin', false)`, [p.platformAdmin])).rejects.toThrow(/your own/);
  });

  it('platform roles cannot be granted by writing the table directly', async () => {
    await expect(as(db, p.platformAdmin)(`insert into platform_role_grants (profile_id, role) values ($1, 'platform_admin')`, [p.stranger])).rejects.toThrow();
  });

  it('ensure_profile is not callable by signed-in users', async () => {
    await expect(as(db, p.stranger)(`select ensure_profile('evil@example.com', 'x')`)).rejects.toThrow(/permission denied/);
  });

  it('the seeded RevTech admins are platform admins', async () => {
    const rows = await sql(db, `select p.email from platform_role_grants g join profiles p on p.id = g.profile_id
      where g.role = 'platform_admin' and p.email like '%@revtech.consulting' order by 1`);
    expect(rows.map(r => r.email)).toEqual(['kbehringer@revtech.consulting', 'reuler@revtech.consulting']);
  });
});

describe('classification and AI provider limits', () => {
  it('a client cannot exceed the environment ceiling', async () => {
    await expect(as(db, p.ctaA)(`update clients set max_classification = 'controlled' where id = $1`, [c.A])).rejects.toThrow(/exceeds/);
    await expect(as(db, p.ctaA)(`update clients set max_classification = 'export_controlled' where id = $1`, [c.A])).rejects.toThrow();
  });

  it('no provider can be approved for CUI in this environment', async () => {
    await expect(as(db, p.platformAdmin)(`insert into ai_providers (name, kind, cui_approved) values ('x', 'anthropic', true)`)).rejects.toThrow();
  });

  it('clients may only allow enabled providers', async () => {
    const admin = as(db, p.platformAdmin);
    const [{ id: off }] = await admin(`insert into ai_providers (name, kind) values ('Disabled', 'anthropic') returning id`);
    const [{ id: on }] = await admin(`insert into ai_providers (name, kind, is_enabled, max_classification)
      values ('Claude (Anthropic API)', 'anthropic', true, 'internal') returning id`);
    await expect(as(db, p.ctaA)(`update clients set allowed_ai_providers = array[$1::uuid] where id = $2`, [off, c.A])).rejects.toThrow(/not enabled/);
    await as(db, p.ctaA)(`update clients set allowed_ai_providers = array[$1::uuid] where id = $2`, [on, c.A]);
    // CTAs see enabled providers only; learners see none.
    expect((await as(db, p.ctaA)('select name from ai_providers')).map(r => r.name)).toEqual(['Claude (Anthropic API)']);
    expect(await as(db, p.learnerA)('select name from ai_providers')).toEqual([]);
  });

  it('client status changes only through activate_client, which checks setup', async () => {
    await expect(as(db, p.ctaA)(`update clients set status = 'active' where id = $1`, [c.A])).rejects.toThrow(/permission denied/);
    await expect(as(db, p.ctaA)(`select activate_client($1)`, [c.A])).rejects.toThrow(/incomplete: industry, govcon_status, sap_landscape, support_contact/);
    await as(db, p.ctaA)(`update clients set industry = 'Aerospace', govcon_status = 'prime',
      sap_landscape = '{"version": "S/4HANA 2023"}', support_contact = 'help@client.example' where id = $1`, [c.A]);
    const [client] = await as(db, p.ctaA)(`select * from activate_client($1)`, [c.A]);
    expect(client.status).toBe('active');
  });
});

describe('audit', () => {
  it('records configuration changes and membership changes', async () => {
    const actions = (await sql(db, `select action from audit_events where client_id = $1`, [c.A])).map(r => r.action);
    expect(actions).toEqual(expect.arrayContaining([
      'clients.insert', 'client_workstreams.insert', 'work_grants.insert', 'client_membership.add',
      'client_membership.set_roles', 'clients.update',
    ]));
    const [event] = await sql(db, `select actor_id, details from audit_events where action = 'clients.update' and client_id = $1 order by id desc limit 1`, [c.A]);
    expect(event.actor_id).toBe(p.ctaA);
    expect(event.details).toHaveProperty('status', 'active');
  });

  it("is readable by the client's CTA only, and only for that client", async () => {
    const clientsSeen = async who => [...new Set((await as(db, p[who])('select client_id from audit_events')).map(r => r.client_id))];
    expect(await clientsSeen('ctaA')).toEqual([c.A]);
    expect(await clientsSeen('lmsA')).toEqual([]);
    expect(await clientsSeen('stranger')).toEqual([]);
    expect(await clientsSeen('platformAdmin')).toEqual([null]);
  });

  it('is append-only, even for the database owner', async () => {
    await expect(as(db, p.ctaA)(`insert into audit_events (action) values ('forged')`)).rejects.toThrow();
    await expect(sql(db, `update audit_events set action = 'x'`)).rejects.toThrow(/append-only/);
    await expect(sql(db, `delete from audit_events`)).rejects.toThrow(/append-only/);
  });

  it('record_audit cannot be called directly', async () => {
    await expect(as(db, p.ctaA)(`select record_audit('forged', $1, null, null)`, [c.A])).rejects.toThrow(/permission denied/);
  });
});
