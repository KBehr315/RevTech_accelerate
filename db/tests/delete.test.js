// Deleting and restoring library documents (00109): who may, what disappears,
// and copies flagged when their original is deleted.

import { randomBytes } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { as, createDb, makeProfile, sql } from './harness.js';

let db;
let meridian, calder;
let cta, author, learner, calderCta, gka, gkaCta;

async function asServer(text, params = []) {
  return db.transaction(async tx => {
    await tx.query('set local role service_role');
    return (await tx.query(text, params)).rows;
  });
}

async function member(clientId, email, roles) {
  const id = await makeProfile(db, email);
  await sql(db, 'insert into client_memberships (client_id, profile_id, roles) values ($1, $2, $3)', [clientId, id, roles]);
  return id;
}

/* Uploads as `who` to `clientId` (null = outside a client), marks it read with one chunk of `text`. */
async function upload(who, clientId, filename, text, sha = randomBytes(32).toString('hex')) {
  const [file] = await as(db, who)('select * from start_upload($1, $2, null, 100)', [clientId, filename]);
  const [asset] = await asServer('select * from complete_upload($1, 100, $2)', [file.id, sha]);
  await sql(db, `update source_files set scan_status = 'not_scanned' where id = $1`, [file.id]);
  await sql(db, `select save_extraction($1, 'done', 'Read 1 page.', $2)`,
    [asset.current_version_id, JSON.stringify([{ text, locator: { page: 1 } }])]);
  return asset;
}

const search = async (who, clientId, query) =>
  (await as(db, who)('select title from search_library($1, $2)', [clientId, query])).map(r => r.title);
const audit = async (assetId) =>
  (await sql(db, 'select action, actor_id from audit_events where target_id = $1 order by id', [assetId]))
    .filter(e => e.action.startsWith('asset.delete') || e.action.startsWith('asset.restore'));

beforeAll(async () => {
  db = await createDb();
  [{ id: meridian }] = await sql(db, `insert into clients (name, slug) values ('Meridian', 'meridian') returning id`);
  [{ id: calder }] = await sql(db, `insert into clients (name, slug) values ('Calder', 'calder') returning id`);
  cta = await member(meridian, 'cta@meridian.example', ['client_training_admin']);
  author = await member(meridian, 'author@meridian.example', ['contributor']);
  learner = await member(meridian, 'learner@meridian.example', ['learner']);
  calderCta = await member(calder, 'cta@calder.example', ['client_training_admin']);
  gka = await makeProfile(db, 'gka@revtech.example');
  await sql(db, `insert into platform_role_grants (profile_id, role) values ($1, 'global_knowledge_admin')`, [gka]);
  gkaCta = await member(meridian, 'kelly@revtech.example', ['client_training_admin']);
  await sql(db, `insert into platform_role_grants (profile_id, role) values ($1, 'global_knowledge_admin')`, [gkaCta]);
});

describe('deleting a client document', () => {
  it('lets a Contributor delete their upload: gone from search, kept in the Deleted list, recorded', async () => {
    const asset = await upload(author, meridian, 'Payroll guide.docx', 'Run payroll with transaction PC00');
    expect(await search(cta, meridian, 'payroll')).toEqual(['Payroll guide']);

    const [deleted] = await as(db, author)('select * from delete_asset($1)', [asset.id]);
    expect(deleted).toMatchObject({ lifecycle_status: 'archived', deleted_by: author });
    expect(deleted.deleted_at).not.toBeNull();

    expect(await search(cta, meridian, 'payroll')).toEqual([]);
    // Still there for the Deleted list.
    expect(await as(db, cta)(`select title from knowledge_assets where id = $1 and lifecycle_status = 'archived'`, [asset.id]))
      .toEqual([{ title: 'Payroll guide' }]);
    expect(await audit(asset.id)).toEqual([{ action: 'asset.delete', actor_id: author }]);
    await expect(as(db, author)('select delete_asset($1)', [asset.id])).rejects.toThrow(/already deleted/);
  });

  it('refuses learners, other clients, and Global Knowledge Administrators without a client role', async () => {
    const asset = await upload(cta, meridian, 'Close checklist.docx', 'Close the period with OB52');
    await expect(as(db, learner)('select delete_asset($1)', [asset.id])).rejects.toThrow(/Only Client Training Administrators and Contributors|No such document/);
    await expect(as(db, calderCta)('select delete_asset($1)', [asset.id])).rejects.toThrow(/No such document/);
    await expect(as(db, gka)('select delete_asset($1)', [asset.id])).rejects.toThrow(/No such document|Only Client/);
    const [row] = await sql(db, 'select lifecycle_status from knowledge_assets where id = $1', [asset.id]);
    expect(row.lifecycle_status).toBe('active');
  });

  it('restores it: back in search, recorded', async () => {
    const asset = await upload(cta, meridian, 'Asset guide.docx', 'Capitalize assets with AS01');
    await as(db, cta)('select delete_asset($1)', [asset.id]);
    await expect(as(db, learner)('select restore_asset($1)', [asset.id])).rejects.toThrow();

    const [restored] = await as(db, cta)('select * from restore_asset($1)', [asset.id]);
    expect(restored).toMatchObject({ lifecycle_status: 'active', deleted_at: null, deleted_by: null });
    expect(await search(cta, meridian, 'AS01')).toEqual(['Asset guide']);
    expect((await audit(asset.id)).map(e => e.action)).toEqual(['asset.delete', 'asset.restore']);
    await expect(as(db, cta)('select restore_asset($1)', [asset.id])).rejects.toThrow(/not deleted/);
  });

  it('frees the file for a new upload, and then refuses to restore the deleted one', async () => {
    const sha = randomBytes(32).toString('hex');
    const first = await upload(cta, meridian, 'Bank guide.docx', 'Bank reconciliation with FF67', sha);
    await as(db, cta)('select delete_asset($1)', [first.id]);
    await upload(cta, meridian, 'Bank guide again.docx', 'Bank reconciliation with FF67', sha);
    await expect(as(db, cta)('select restore_asset($1)', [first.id]))
      .rejects.toThrow('The library already has this file: "Bank guide again". Delete that one first if you want this one back.');
  });
});

describe('documents outside a client', () => {
  it('only Global Knowledge Administrators delete them', async () => {
    const asset = await upload(gka, null, 'Playbook.docx', 'Generic close playbook');
    await as(db, gka)(`select place_asset($1, 'global')`, [asset.id]);
    await expect(as(db, cta)('select delete_asset($1)', [asset.id])).rejects.toThrow(/Only Global Knowledge Administrators|No such document/);
    const [deleted] = await as(db, gka)('select * from delete_asset($1)', [asset.id]);
    expect(deleted.lifecycle_status).toBe('archived');
  });
});

describe('copies of a deleted document', () => {
  it('stay, and are flagged until the original is restored', async () => {
    const original = await upload(author, meridian, 'FB50 walkthrough.docx', 'Post a journal entry with FB50');
    const [copy] = await as(db, gkaCta)(`select * from copy_asset($1, 'revtech_reference')`, [original.id]);
    expect(copy.original_deleted_at).toBeNull();

    await as(db, author)('select delete_asset($1)', [original.id]);
    const [flagged] = await as(db, gka)('select lifecycle_status, original_deleted_at from knowledge_assets where id = $1', [copy.id]);
    expect(flagged.lifecycle_status).toBe('active');
    expect(flagged.original_deleted_at).not.toBeNull();
    expect(await search(gka, null, 'FB50')).toEqual(['FB50 walkthrough']);

    await as(db, author)('select restore_asset($1)', [original.id]);
    const [cleared] = await sql(db, 'select original_deleted_at from knowledge_assets where id = $1', [copy.id]);
    expect(cleared.original_deleted_at).toBeNull();
  });
});
