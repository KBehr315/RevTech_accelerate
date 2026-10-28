// A real Postgres (PGlite, compiled to WebAssembly) with every migration in
// db/migrations applied, for testing RLS policies and security-definer
// functions without a database server.
//
// Queries made through `as(profileId)` run the way PostgREST runs them: as the
// `authenticated` role, with the caller's id in request.jwt.claims, inside a
// transaction that is rolled back on error.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

export async function createDb() {
  const db = new PGlite();
  const files = (await fs.readdir(MIGRATIONS_DIR)).filter(f => f.endsWith('.sql')).sort();
  for (const file of files) {
    try {
      await db.exec(await fs.readFile(path.join(MIGRATIONS_DIR, file), 'utf8'));
    } catch (err) {
      throw new Error(`${file} failed: ${err.message}`);
    }
  }
  return db;
}

/* Run `fn(query)` as the given profile (null = signed in, no profile). */
export function as(db, profileId) {
  return async (sql, params = []) => db.transaction(async tx => {
    await tx.query('set local role authenticated');
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ role: 'authenticated', sub: profileId })]);
    return (await tx.query(sql, params)).rows;
  });
}

/* Superuser query, for fixtures and for looking past RLS in assertions. */
export async function sql(db, text, params = []) {
  return (await db.query(text, params)).rows;
}

export async function makeProfile(db, email, name = email) {
  const [profile] = await sql(db, 'select * from public.ensure_profile($1, $2)', [email, name]);
  return profile.id;
}
