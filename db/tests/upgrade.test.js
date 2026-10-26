// 00100 must also apply to the preview database, which already ran the
// retired compliance migrations (db/migrations/archive/compliance-lms).

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { expect, it } from 'vitest';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

it('upgrades a database that ran the compliance LMS migrations', async () => {
  const db = new PGlite({ extensions: { pgcrypto } });
  const archive = path.join(DIR, 'archive', 'compliance-lms');
  const run = async file => db.exec(await fs.readFile(file, 'utf8'));

  await run(path.join(DIR, '00000_azure_supabase_compat.sql'));
  for (const f of (await fs.readdir(archive)).sort()) await run(path.join(archive, f));
  await db.exec(`insert into auth.users (email) values ('old.employee@revtech.consulting')`);

  for (const f of (await fs.readdir(DIR)).filter(f => f.endsWith('.sql') && f > '00000').sort()) {
    await run(path.join(DIR, f));
  }

  const { rows } = await db.query(`select to_regclass('public.modules') as modules, to_regclass('public.clients') as clients`);
  expect(rows[0].modules).toBeNull();
  expect(rows[0].clients).toBe('clients');
  // An old auth.users row still gets a profile on next sign-in.
  const { rows: [profile] } = await db.query(`select * from ensure_profile('old.employee@revtech.consulting', 'Old Employee')`);
  expect(profile.full_name).toBe('Old Employee');
});
