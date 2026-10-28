// Knowledge library, part 1 (00103): uploads, defaults, who sees what, and the
// malware-scan gate on downloads.

import { beforeAll, describe, expect, it } from 'vitest';
import { as, createDb, makeProfile, sql } from './harness.js';

let db;
let meridian, calder;
let cta, author, author2, reviewer, learner, lmsa, otherCta, gka, platformAdmin;
let fiWorkstream;

/* What the API server does after writing the blob, as service_role. */
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

/* start_upload as `profileId`, then complete_upload as the server. Returns the asset. */
async function upload(profileId, clientId, filename = 'FI-GL-010 Post Journal Entry.docx', bytes = 2048) {
  const [file] = await as(db, profileId)('select * from start_upload($1, $2, $3, $4)',
    [clientId, filename, 'application/octet-stream', bytes]);
  const [asset] = await asServer('select * from complete_upload($1, $2, $3)', [file.id, bytes, 'ab'.repeat(32)]);
  return { file, asset };
}

const visibleTitles = async (profileId, clientId) =>
  (await as(db, profileId)('select title from knowledge_assets where client_id is not distinct from $1 order by title', [clientId]))
    .map(r => r.title);

beforeAll(async () => {
  db = await createDb();
  [{ id: meridian }] = await sql(db, `insert into clients (name, slug) values ('Meridian', 'meridian') returning id`);
  [{ id: calder }] = await sql(db,
    `insert into clients (name, slug, max_classification) values ('Calder', 'calder', 'confidential') returning id`);
  [{ id: fiWorkstream }] = await sql(db,
    `insert into client_workstreams (client_id, code, name) values ($1, 'FI', 'Finance') returning id`, [meridian]);

  cta = await member(meridian, 'cta@meridian.example', ['client_training_admin']);
  author = await member(meridian, 'author@meridian.example', ['contributor']);
  author2 = await member(meridian, 'author2@meridian.example', ['contributor']);
  reviewer = await member(meridian, 'reviewer@meridian.example', ['reviewer']);
  learner = await member(meridian, 'learner@meridian.example', ['learner']);
  lmsa = await member(meridian, 'lmsa@meridian.example', ['lms_admin']);
  otherCta = await member(calder, 'cta@calder.example', ['client_training_admin']);
  gka = await makeProfile(db, 'gka@revtech.example');
  await sql(db, `insert into platform_role_grants (profile_id, role) values ($1, 'global_knowledge_admin')`, [gka]);
  platformAdmin = await makeProfile(db, 'admin@revtech.example');
  await sql(db, `insert into platform_role_grants (profile_id, role) values ($1, 'platform_admin')`, [platformAdmin]);
});

describe('uploading to a client', () => {
  it('applies the client defaults, creates version 1, queues a scan and audits it', async () => {
    const { file, asset } = await upload(cta, meridian);

    expect(file.blob_path).toBe(`clients/${meridian}/${file.id}`);
    expect(asset).toMatchObject({
      scope: 'client', client_id: meridian, title: 'FI-GL-010 Post Journal Entry',
      approval_status: 'draft', lifecycle_status: 'active', ai_use: 'human_approval_required',
      security_classification: 'client_confidential', owner_id: cta,
    });
    const [version] = await sql(db, 'select * from knowledge_asset_versions where id = $1', [asset.current_version_id]);
    expect(version).toMatchObject({ version_no: 1, source_file_id: file.id, extraction_status: 'pending' });
    const [stored] = await sql(db, 'select upload_status, scan_status, sha256 from source_files where id = $1', [file.id]);
    expect(stored).toEqual({ upload_status: 'stored', scan_status: 'pending', sha256: 'ab'.repeat(32) });

    const jobs = await sql(db, `select * from jobs where kind = 'scan_file' and payload->>'file_id' = $1`, [file.id]);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ client_id: meridian, requested_by: cta });
    // The uploader can follow the scan job.
    expect(await as(db, cta)('select id from jobs where id = $1', [jobs[0].id])).toHaveLength(1);

    const audit = await sql(db, `select * from audit_events where action = 'asset.upload' and target_id = $1`, [asset.id]);
    expect(audit[0]).toMatchObject({ actor_id: cta, client_id: meridian });
  });

  it("caps the default classification at the client's ceiling", async () => {
    const { asset } = await upload(otherCta, calder, 'AP invoice entry.pdf');
    expect(asset.security_classification).toBe('confidential');
  });

  it('lets Contributors upload, and refuses learners, LMS Administrators and other clients', async () => {
    await expect(upload(author, meridian, 'author upload.xlsx')).resolves.toBeTruthy();
    for (const who of [learner, lmsa, reviewer, otherCta]) {
      await expect(as(db, who)('select * from start_upload($1, $2, null, 10)', [meridian, 'x.docx']))
        .rejects.toThrow(/may not upload files to this client/);
    }
  });

  it('refuses unsupported types, empty files and files over the size limit', async () => {
    const start = (name, bytes) => as(db, cta)('select * from start_upload($1, $2, null, $3)', [meridian, name, bytes]);
    await expect(start('setup.exe', 10)).rejects.toThrow(/EXE files are not supported/);
    await expect(start('no-extension', 10)).rejects.toThrow(/not supported/);
    await expect(start('empty.docx', 0)).rejects.toThrow(/empty/);
    await expect(start('huge.pdf', 101 * 1024 * 1024)).rejects.toThrow(/up to 100 MB/);
  });

  it('keeps the server-only steps away from callers', async () => {
    const [file] = await as(db, cta)('select * from start_upload($1, $2, null, 10)', [meridian, 'direct.docx']);
    await expect(as(db, cta)('select * from complete_upload($1, 10, $2)', [file.id, 'cd'.repeat(32)]))
      .rejects.toThrow(/permission denied/);
    await expect(as(db, cta)(`insert into knowledge_assets (scope, client_id, title, security_classification, ai_use)
                              values ('global', null, 'sneaky', 'public', 'generation')`)).rejects.toThrow(/permission denied/);
    await expect(as(db, cta)(`update knowledge_assets set scope = 'global'`)).rejects.toThrow(/permission denied/);
  });
});

describe('who sees client assets', () => {
  let granted;

  beforeAll(async () => {
    ({ asset: granted } = await upload(cta, meridian, 'FI-AP-020 Enter Vendor Invoice.docx'));
    await sql(db, 'update knowledge_assets set workstream_ids = $2 where id = $1', [granted.id, [fiWorkstream]]);
    await sql(db, `insert into work_grants (client_id, profile_id, capacity, target_type, target_id)
                   values ($1, $2, 'reviewer', 'workstream', $3)`, [meridian, reviewer, fiWorkstream]);
  });

  it('shows Client Training Administrators everything in their client', async () => {
    expect(await visibleTitles(cta, meridian)).toContain('FI-AP-020 Enter Vendor Invoice');
    expect(await visibleTitles(cta, meridian)).toContain('author upload');
  });

  it('shows Contributors and Reviewers what they uploaded or were granted, nothing else', async () => {
    expect(await visibleTitles(author, meridian)).toEqual(['author upload']);
    expect(await visibleTitles(author2, meridian)).toEqual([]);
    expect(await visibleTitles(reviewer, meridian)).toEqual(['FI-AP-020 Enter Vendor Invoice']);
  });

  it('shows learners, LMS Administrators, other clients and Platform Administrators nothing', async () => {
    for (const who of [learner, lmsa, otherCta, platformAdmin]) {
      expect(await visibleTitles(who, meridian)).toEqual([]);
      expect(await as(db, who)('select * from source_files where client_id = $1', [meridian])).toEqual([]);
      expect(await as(db, who)(
        'select v.* from knowledge_asset_versions v join knowledge_assets a on a.id = v.asset_id where a.client_id = $1',
        [meridian])).toEqual([]);
    }
  });

  it('stops showing an uploader their files once they leave the client', async () => {
    await sql(db, 'update client_memberships set is_active = false where profile_id = $1', [author]);
    expect(await visibleTitles(author, meridian)).toEqual([]);
    await sql(db, 'update client_memberships set is_active = true where profile_id = $1', [author]);
  });
});

describe('uploading outside a client', () => {
  it('puts the file in Pending Classification, not usable by AI, for the uploader and GKAs only', async () => {
    const { asset } = await upload(gka, null, 'S4HANA GL overview.pdf');
    expect(asset).toMatchObject({ scope: 'pending_classification', client_id: null, ai_use: 'not_approved',
                                  security_classification: 'internal' });
    expect(await visibleTitles(gka, null)).toContain('S4HANA GL overview');
    expect(await visibleTitles(cta, null)).toEqual([]);
  });

  it('is for Global Knowledge Administrators only', async () => {
    await expect(as(db, cta)('select * from start_upload(null, $1, null, 10)', ['x.pdf']))
      .rejects.toThrow(/Only Global Knowledge Administrators/);
  });
});

describe('downloads and the malware scan', () => {
  it('waits for the scan, then allows clean files and refuses infected ones', async () => {
    const { file } = await upload(cta, meridian, 'scan me.docx');
    const download = who => as(db, who)('select * from file_for_download($1)', [file.id]);

    await expect(download(cta)).rejects.toThrow(/still being checked/);
    await sql(db, `select record_scan_result($1, 'clean')`, [file.id]);
    expect(await download(cta)).toEqual([{ blob_path: file.blob_path, filename: 'scan me.docx', mime_type: 'application/octet-stream' }]);
    await expect(download(otherCta)).rejects.toThrow(/File not found/);

    const { file: bad } = await upload(cta, meridian, 'bad.docx');
    await sql(db, `select record_scan_result($1, 'infected')`, [bad.id]);
    await expect(as(db, cta)('select * from file_for_download($1)', [bad.id])).rejects.toThrow(/failed its virus check/);
    const audit = await sql(db, `select * from audit_events where action = 'file.infected' and target_id = $1`, [bad.id]);
    expect(audit).toHaveLength(1);
  });

  it('records a result once; a later result does not overwrite it', async () => {
    const { file } = await upload(cta, meridian, 'once.docx');
    await sql(db, `select record_scan_result($1, 'infected')`, [file.id]);
    await sql(db, `select record_scan_result($1, 'clean')`, [file.id]);
    expect((await sql(db, 'select scan_status from source_files where id = $1', [file.id]))[0].scan_status).toBe('infected');
  });

  it('keeps the scan functions for the worker', async () => {
    await expect(as(db, cta)(`select record_scan_result(gen_random_uuid(), 'clean')`)).rejects.toThrow(/permission denied/);
  });
});

describe('classification ceilings and settings', () => {
  it('refuses CUI and export-controlled assets, and anything above the client ceiling', async () => {
    const { asset } = await upload(otherCta, calder, 'ceiling.pdf');
    await expect(sql(db, `update knowledge_assets set security_classification = 'controlled' where id = $1`, [asset.id]))
      .rejects.toThrow(/may not be stored in this environment/);
    await expect(sql(db, `update knowledge_assets set security_classification = 'client_confidential' where id = $1`, [asset.id]))
      .rejects.toThrow(/exceeds what this client allows/);
  });

  it('lets a Platform Administrator turn scanning off in preview only', async () => {
    await as(db, platformAdmin)(`update platform_settings set malware_scanning = 'off'`);
    expect((await sql(db, 'select malware_scanning from platform_settings'))[0].malware_scanning).toBe('off');
    await expect(sql(db, `update platform_settings set environment_name = 'production'`))
      .rejects.toThrow(/malware_scanning_off_only_in_preview/);
    expect(await as(db, cta)(`update platform_settings set malware_scanning = 'defender' returning 1`)).toEqual([]);
    await as(db, platformAdmin)(`update platform_settings set malware_scanning = 'defender'`);
  });
});
