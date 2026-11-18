/**
 * Vitest global setup: ensures the separate test database exists and has the
 * current migrations applied. Skips gracefully (with a warning) when no
 * local PostgreSQL is reachable — DB-dependent tests then skip themselves
 * and report it honestly.
 */
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

import { TEST_DATABASE_URL } from './database-config.js';

async function ensureTestDatabase(): Promise<boolean> {
  const adminUrl = new URL(TEST_DATABASE_URL);
  adminUrl.pathname = '/postgres';
  const pool = new pg.Pool({ connectionString: adminUrl.toString() });
  try {
    const existing = await pool.query(
      "SELECT 1 FROM pg_database WHERE datname = 'teamdesk_test'",
    );
    if (existing.rowCount === 0) {
      await pool.query('CREATE DATABASE teamdesk_test OWNER teamdesk');
    }
    return true;
  } catch {
    return false;
  } finally {
    await pool.end();
  }
}

export default async function globalSetup(): Promise<void> {
  const reachable = await ensureTestDatabase();
  if (!reachable) {
    console.warn(
      '[test-global-setup] PostgreSQL unreachable — database-dependent tests will skip.',
    );
    return;
  }
  const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL });
  try {
    const db = drizzle(pool);
    await migrate(db, { migrationsFolder: './drizzle' });
  } finally {
    await pool.end();
  }
}
