// Applies db/migrations/*.sql in filename order, once each, and keeps the
// PostgREST login role in step with its secret.
//
// Runs as the Container Apps job caj-accelerate-migrate (same image as the app,
// different command), because the Postgres server has no public endpoint. The
// deploy workflow starts it before rolling out a new app revision.
//
//   DATABASE_URL                 admin connection string to the accelerate database
//   AUTHENTICATOR_PASSWORD       password PostgREST connects with (pgrst-db-uri)
//   WORKER_PASSWORD              password the background worker connects with
//                                (optional until the worker is deployed)

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, '..', 'db', 'migrations');
const AUTHENTICATOR = 'accelerate_authenticator';
const WORKER = 'accelerate_worker';
// Arbitrary constant: keeps two overlapping job runs from applying the same file twice.
const LOCK_ID = 7_310_442;

async function main() {
  for (const name of ['DATABASE_URL', 'AUTHENTICATOR_PASSWORD']) {
    if (!process.env[name]) throw new Error(`${name} is not set.`);
  }

  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: true } });
  await client.connect();
  try {
    await client.query('select pg_advisory_lock($1)', [LOCK_ID]);

    // Outside the public schema, so PostgREST never exposes it.
    await client.query(`
      create schema if not exists migrations;
      create table if not exists migrations.applied (
        name        text primary key,
        applied_at  timestamptz not null default now()
      );
    `);

    const applied = new Set((await client.query('select name from migrations.applied')).rows.map(r => r.name));
    const files = (await fs.readdir(MIGRATIONS_DIR)).filter(f => f.endsWith('.sql')).sort();

    let ran = 0;
    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = await fs.readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
      console.log(`applying ${file}`);
      await client.query('begin');
      try {
        await client.query(sql);
        await client.query('insert into migrations.applied (name) values ($1)', [file]);
        await client.query('commit');
        ran++;
      } catch (err) {
        await client.query('rollback');
        throw new Error(`${file} failed: ${err.message}`);
      }
    }

    // After the migrations, because 00000 and 00101 create the roles granted here.
    const database = client.escapeIdentifier((await client.query('select current_database() as db')).rows[0].db);
    const loginRole = async (name, password, grants) => {
      const { rowCount } = await client.query('select 1 from pg_roles where rolname = $1', [name]);
      await client.query(`${rowCount ? 'alter' : 'create'} role ${name} with login noinherit password ${client.escapeLiteral(password)}`);
      await client.query(`grant ${grants} to ${name}`);
      await client.query(`grant connect on database ${database} to ${name}`);
    };
    // PostgREST switches into these per request.
    await loginRole(AUTHENTICATOR, process.env.AUTHENTICATOR_PASSWORD, 'authenticated, service_role');
    // The worker claims jobs as `worker` and acts for a requester as `authenticated`.
    if (process.env.WORKER_PASSWORD) await loginRole(WORKER, process.env.WORKER_PASSWORD, 'worker, authenticated');

    // PostgREST caches the schema; it listens on this channel and reloads, so
    // new tables and functions are reachable without restarting it.
    await client.query(`notify pgrst, 'reload schema'`);

    console.log(`done: ${ran} applied, ${files.length - ran} already in place`);
  } finally {
    await client.end();
  }
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
