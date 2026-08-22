/**
 * Migration entrypoint for the `migrate` init container.
 *
 * Bundled by esbuild into /app/migrate.mjs at image build time: Next's
 * standalone tracing does not reach this file (no route imports it) and does
 * not include drizzle/*.sql (read at runtime by path).
 *
 * Never run this from the app process: a migration racing the readiness probe
 * turns a clear Init:Error into a half-started HTTP server. Concurrency is
 * ruled out by replicas: 1 plus strategy Recreate — drizzle's migrator takes no
 * advisory lock.
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { seedLookups } from './seed/run';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}

const ATTEMPTS = 15;
const DELAY_MS = 2000;

// max: 1 — the migrator must not open a pool.
const sql = postgres(url, { max: 1, onnotice: () => {} });

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Postgres may still be starting up when this container runs. Retrying here
 * keeps the first deploy from looking like a crash loop; a genuine failure
 * still ends as a legible Init:Error after the attempts are used up.
 */
async function waitForDatabase(): Promise<void> {
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      await sql`select 1`;
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(
        `database not ready (attempt ${attempt}/${ATTEMPTS}): ${message}`
      );
      if (attempt === ATTEMPTS) throw error;
      await sleep(DELAY_MS);
    }
  }
}

try {
  await waitForDatabase();
  const db = drizzle(sql);
  await migrate(db, { migrationsFolder: './drizzle' });
  console.log('migrations applied');
  // Seeds run here too: they are idempotent, and a database without symptom
  // types or tags is not a usable app.
  const counts = await seedLookups(db);
  console.log('lookups seeded', JSON.stringify(counts));
} catch (error) {
  console.error('migration failed:', error);
  process.exitCode = 1;
} finally {
  await sql.end();
}
