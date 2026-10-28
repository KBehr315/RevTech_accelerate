// Knowledge library buckets (00106): Global, Shared, Client, RevTech Reference
// and Pending; who sees each, placing, copying out of a client, and search.

import { beforeAll, describe, expect, it } from 'vitest';
import { as, createDb, makeProfile, sql } from './harness.js';

let db;
let meridian, calder, apex;
let cta, author, learner, calderCta, apexAuthor, gka, gkaCta, platformAdmin;
let aerospace;

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
async function upload(who, clientId, filename, text) {
  const [file] = await as(db, who)('select * from start_upload($1, $2, null, 100)', [clientId, filename]);
  const [asset] = await asServer('select * from complete_upload($1, 100, $2)', [file.id, 'cd'.repeat(32)]);
  await sql(db, `update source_files set scan_status = 'not_scanned' where id = $1`, [file.id]);
  await sql(db, `select save_extraction($1, 'done', 'Read 1 page.', $2)`,
    [asset.current_version_id, JSON.stringify([{ text, locator: { page: 1 } }])]);
  return asset;
}

const sees = async (who, assetId) =>
  (await as(db, who)('select id from knowledge_assets where id = $1', [assetId])).length === 1;
const search = async (who, clientId, query) =>
  (await as(db, who)('select title, scope from search_library($1, $2)', [clientId, query])).map(r => r.title).sort();

beforeAll(async () => {
  db = await createDb();
  [{ id: meridian }] = await sql(db, `insert into clients (name, slug) values ('Meridian', 'meridian') returning id`);
  [{ id: calder }] = await sql(db, `insert into clients (name, slug) values ('Calder', 'calder') returning id`);
  [{ id: apex }] = await sql(db, `insert into clients (name, slug) values ('Apex', 'apex') returning id`);
  [{ id: aerospace }] = await sql(db, `insert into client_groups (name) values ('Aerospace') returning id`);
  await sql(db, 'insert into client_group_members (group_id, client_id) values ($1, $2)', [aerospace, apex]);

  cta = await member(meridian, 'cta@meridian.example', ['client_training_admin']);
  author = await member(meridian, 'author@meridian.example', ['contributor']);
  learner = await member(meridian, 'learner@meridian.example', ['learner']);
  calderCta = await member(calder, 'cta@calder.example', ['client_training_admin']);
  apexAuthor = await member(apex, 'author@apex.example', ['contributor']);
  gka = await makeProfile(db, 'gka@revtech.example');
  await sql(db, `insert into platform_role_grants (profile_id, role) values ($1, 'global_knowledge_admin')`, [gka]);
  // Like Kelly: a Global Knowledge Administrator who is also Meridian's Client Training Administrator.
  gkaCta = await member(meridian, 'kelly@revtech.example', ['client_training_admin']);
  await sql(db, `insert into platform_role_grants (profile_id, role) values ($1, 'global_knowledge_admin')`, [gkaCta]);
  platformAdmin = await makeProfile(db, 'admin@revtech.example');
  await sql(db, `insert into platform_role_grants (profile_id, role) values ($1, 'platform_admin')`, [platformAdmin]);
});

describe('placing documents uploaded outside a client', () => {
  it('starts in Pending, then moves to RevTech Reference, seen by Global Knowledge Administrators only', async () => {
    const asset = await upload(gka, null, 'Month-end close playbook.docx', 'Month-end close checklist for the controller');
    expect(asset).toMatchObject({ scope: 'pending_classification', ai_use: 'not_approved' });

    const [placed] = await as(db, gka)(`select * from place_asset($1, 'revtech_reference')`, [asset.id]);
    expect(placed).toMatchObject({ scope: 'revtech_reference', ai_use: 'human_approval_required' });

    expect(await sees(gka, asset.id)).toBe(true);
    for (const who of [cta, author, learner, calderCta, apexAuthor, platformAdmin]) {
      expect(await sees(who, asset.id)).toBe(false);
    }
    expect(await as(db, cta)('select * from source_chunks where asset_id = $1', [asset.id])).toEqual([]);

    const [audit] = await sql(db, `select * from audit_events where action = 'asset.place' and target_id = $1`, [asset.id]);
    expect(audit.details).toMatchObject({ from: 'pending_classification', to: 'revtech_reference' });
  });

  it('shares with chosen clients and with members of chosen groups, not with learners', async () => {
    const asset = await upload(gka, null, 'GovCon indirect rates.pdf', 'Indirect rate structure for government contractors');

    await expect(as(db, gka)(`select place_asset($1, 'shared')`, [asset.id])).rejects.toThrow(/at least one client/);
    await as(db, gka)(`select place_asset($1, 'shared', $2, $3)`, [asset.id, [meridian], [aerospace]]);

    expect(await sees(cta, asset.id)).toBe(true);
    expect(await sees(author, asset.id)).toBe(true);
    expect(await sees(apexAuthor, asset.id)).toBe(true); // through the Aerospace group
    expect(await sees(learner, asset.id)).toBe(false);
    expect(await sees(calderCta, asset.id)).toBe(false);

    const shared = await as(db, cta)('select title from client_shared_assets($1)', [meridian]);
    expect(shared.map(r => r.title)).toContain('GovCon indirect rates');
    expect(await as(db, calderCta)('select title from client_shared_assets($1)', [calder])).toEqual([]);

    // Moving it on to Global drops the audiences; everyone who authors anywhere sees it.
    await as(db, gka)(`select place_asset($1, 'global')`, [asset.id]);
    expect(await sql(db, 'select * from asset_audiences where asset_id = $1', [asset.id])).toEqual([]);
    expect(await sees(calderCta, asset.id)).toBe(true);
    expect(await sees(learner, asset.id)).toBe(false);
  });

  it('is for Global Knowledge Administrators only, and never moves a client document', async () => {
    const pending = await upload(gka, null, 'Notes.txt', 'notes');
    for (const who of [cta, platformAdmin]) {
      await expect(as(db, who)(`select place_asset($1, 'global')`, [pending.id])).rejects.toThrow(/Only Global Knowledge Administrators/);
    }
    const clientDoc = await upload(gkaCta, meridian, 'Meridian close calendar.xlsx', 'close calendar');
    await expect(as(db, gkaCta)(`select place_asset($1, 'revtech_reference')`, [clientDoc.id])).rejects.toThrow(/Copy it instead/);
  });
});

describe('copying a client document', () => {
  let original;

  beforeAll(async () => {
    original = await upload(gkaCta, meridian, 'Meridian FB50 walkthrough.docx', 'Post a journal entry with FB50 at Meridian');
  });

  it('copies into RevTech Reference: the client keeps its own, the copy has the text and remembers its source', async () => {
    const [copy] = await as(db, gkaCta)(`select * from copy_asset($1, 'revtech_reference')`, [original.id]);
    expect(copy).toMatchObject({
      scope: 'revtech_reference', client_id: null, copied_from_asset_id: original.id,
      title: 'Meridian FB50 walkthrough', ai_use: 'human_approval_required',
    });

    // The original is untouched and still Meridian's.
    expect(await sees(cta, original.id)).toBe(true);
    expect(await sees(cta, copy.id)).toBe(false);

    const [version] = await sql(db, 'select * from knowledge_asset_versions where id = $1', [copy.current_version_id]);
    const [originalVersion] = await sql(db, 'select * from knowledge_asset_versions where id = $1', [original.current_version_id]);
    expect(version).toMatchObject({
      source_file_id: originalVersion.source_file_id, extraction_status: 'done', change_note: 'Copied from Meridian',
    });
    const chunks = await sql(db, 'select client_id, text from source_chunks where asset_id = $1', [copy.id]);
    expect(chunks).toEqual([{ client_id: null, text: 'Post a journal entry with FB50 at Meridian' }]);

    // Meridian's administrators can see that it was copied out.
    const audit = await as(db, cta)(`select details from audit_events where action = 'asset.copy' and target_id = $1`, [original.id]);
    expect(audit[0].details).toMatchObject({ to: 'revtech_reference', copy_id: copy.id });
    expect(await as(db, gkaCta)('select * from asset_copies($1)', [[original.id]]))
      .toEqual([{ copied_from_asset_id: original.id, scope: 'revtech_reference' }]);

    await expect(as(db, gkaCta)(`select copy_asset($1, 'revtech_reference')`, [original.id])).rejects.toThrow(/already been copied/);
  });

  it('needs a Global Knowledge Administrator who can read the original', async () => {
    await expect(as(db, cta)(`select copy_asset($1, 'revtech_reference')`, [original.id])).rejects.toThrow(/Only Global Knowledge Administrators/);
    // gka is not a Meridian member, so cannot read Meridian's documents.
    await expect(as(db, gka)(`select copy_asset($1, 'revtech_reference')`, [original.id])).rejects.toThrow(/No such client document/);
  });

  it('copies to Global or Shared only with the client\'s Client Training Administrator', async () => {
    const authorDoc = await upload(author, meridian, 'Author notes.docx', 'author notes');
    // A Global Knowledge Administrator who authors at Meridian but is not its CTA.
    const gkaAuthor = await member(meridian, 'gka-author@revtech.example', ['contributor']);
    await sql(db, `insert into platform_role_grants (profile_id, role) values ($1, 'global_knowledge_admin')`, [gkaAuthor]);
    await sql(db, `insert into work_grants (client_id, profile_id, capacity, target_type, target_id)
      values ($1, $2, 'contributor', 'asset', $3)`, [meridian, gkaAuthor, authorDoc.id]);

    await expect(as(db, gkaAuthor)(`select copy_asset($1, 'global')`, [authorDoc.id])).rejects.toThrow(/Client Training Administrator/);
    const [toRef] = await as(db, gkaAuthor)(`select * from copy_asset($1, 'revtech_reference')`, [authorDoc.id]);
    expect(toRef.scope).toBe('revtech_reference');

    const [shared] = await as(db, gkaCta)(`select * from copy_asset($1, 'shared', $2)`, [authorDoc.id, [calder]]);
    expect(await sees(calderCta, shared.id)).toBe(true);
    expect(await sees(apexAuthor, shared.id)).toBe(false);
  });

  it('waits until the file has been read', async () => {
    const [file] = await as(db, gkaCta)(`select * from start_upload($1, 'Unread.pdf', null, 100)`, [meridian]);
    const [asset] = await asServer('select * from complete_upload($1, 100, $2)', [file.id, 'ef'.repeat(32)]);
    await expect(as(db, gkaCta)(`select copy_asset($1, 'revtech_reference')`, [asset.id])).rejects.toThrow(/Wait until the file has been read/);
  });
});

describe('searching across buckets', () => {
  it('finds client, Global, Shared-with-this-client and (for Global Knowledge Administrators) RevTech Reference', async () => {
    const own = await upload(cta, meridian, 'Meridian asset retirement.docx', 'asset retirement with ABAVN');
    const calderOwn = await upload(calderCta, calder, 'Calder asset retirement.docx', 'asset retirement at Calder');
    const global = await upload(gka, null, 'SAP asset retirement overview.pdf', 'asset retirement overview');
    await as(db, gka)(`select place_asset($1, 'global')`, [global.id]);
    const sharedCalder = await upload(gka, null, 'Retirement for Calder.pdf', 'asset retirement for subcontractors');
    await as(db, gka)(`select place_asset($1, 'shared', $2)`, [sharedCalder.id, [calder]]);
    const reference = await upload(gka, null, 'Retirement reference deck.pptx', 'asset retirement reference');
    await as(db, gka)(`select place_asset($1, 'revtech_reference')`, [reference.id]);

    expect(await search(cta, meridian, 'asset retirement')).toEqual(['Meridian asset retirement', 'SAP asset retirement overview']);
    expect(await search(calderCta, calder, 'asset retirement'))
      .toEqual(['Calder asset retirement', 'Retirement for Calder', 'SAP asset retirement overview']);
    expect(await search(gkaCta, meridian, 'asset retirement'))
      .toEqual(['Meridian asset retirement', 'Retirement reference deck', 'SAP asset retirement overview']);
    // Global context: everything outside a client the caller can see.
    expect(await search(gka, null, 'asset retirement'))
      .toEqual(['Retirement for Calder', 'Retirement reference deck', 'SAP asset retirement overview']);
    expect(await search(learner, meridian, 'asset retirement')).toEqual([]);
    expect(own && calderOwn).toBeTruthy();
  });
});
