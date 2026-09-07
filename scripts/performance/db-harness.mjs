// Supplementary PostgreSQL/WASM verification. Does not connect to Supabase or any remote database.
// Scratch setup: npm install --prefix output/performance-tools --no-save --package-lock=false --ignore-scripts @electric-sql/pglite @electric-sql/pglite-pgtap
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

export async function createTestDatabase(root = process.cwd(), beforeMigration = null) {
  const require = createRequire(resolve(process.cwd(), 'output/performance-tools/package.json'));
  const { PGlite } = require('@electric-sql/pglite');
  const { pgcrypto } = require('@electric-sql/pglite/contrib/pgcrypto');
  const { pg_trgm } = require('@electric-sql/pglite/contrib/pg_trgm');
  const { pgtap } = require('@electric-sql/pglite-pgtap');
  const db = new PGlite({ extensions: { pgcrypto, pg_trgm, pgtap } });
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create schema extensions;
    create table auth.users (id uuid primary key, email text, last_sign_in_at timestamptz, created_at timestamptz, updated_at timestamptz);
    grant usage on schema public, auth, extensions to anon, authenticated, service_role;
    create function auth.uid() returns uuid language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
        nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'sub')::uuid;
    $$;
    create function auth.role() returns text language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''),
        nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'role');
    $$;
    create extension pgcrypto with schema extensions;
    set search_path = public, extensions;
  `);
  for (const file of readdirSync(resolve(root, 'supabase/migrations')).filter(f => f.endsWith('.sql')).sort()) {
    if (beforeMigration && file >= beforeMigration) continue;
    try { await db.exec(readFileSync(resolve(root, 'supabase/migrations', file), 'utf8')); }
    catch (error) { await db.close(); throw new Error(`Migration ${file}: ${error.message}`); }
  }
  return db;
}

export async function runDatabaseTests(root = process.cwd()) {
  const db = await createTestDatabase(root);
  const version = await db.query('select version()');
  console.log(version.rows[0].version);
  let failures = 0;
  let assertions = 0;
  try {
    for (const file of readdirSync(resolve(root, 'supabase/tests/database')).filter(f => f.endsWith('.sql')).sort()) {
      try {
        const results = await db.exec(readFileSync(resolve(root, 'supabase/tests/database', file), 'utf8'));
        const lines = results.flatMap(r => r.rows.flatMap(row => Object.values(row))).filter(v => typeof v === 'string');
        const failed = lines.filter(line => /^not ok\b|^#.*(?:failed|planned)/m.test(line));
        assertions += lines.filter(line => /^(?:not )?ok\b/.test(line)).length;
        if (failed.length) { failures++; console.log(`FAIL ${file}\n${failed.join('\n')}`); }
        else console.log(`PASS ${file}`);
      } catch (error) {
        failures++;
        console.log(`ERROR ${file}: ${error.message}`);
        await db.exec('rollback; reset role; set search_path = public, extensions;');
      }
    }
  } finally { await db.close(); }
  console.log(JSON.stringify({ assertions, failures }));
  return failures;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runDatabaseTests(resolve(process.argv[2] ?? '.')).then(failures => { process.exitCode = failures ? 1 : 0; })
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}
