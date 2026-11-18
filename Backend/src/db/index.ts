import pg from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { env } from '../config/env.js';

/**
 * PostgreSQL connection and Drizzle ORM entry point.
 *
 * The pool is created eagerly but connections are only opened when a query
 * runs. Migrations are NOT executed on startup (by design, see README);
 * apply them explicitly with `npm run db:migrate`.
 */
export const pool = new pg.Pool({ connectionString: env.DATABASE_URL });

export const db: NodePgDatabase<Record<string, never>> = drizzle(pool);

/** Cheap connectivity probe used by startup and verification. */
export async function pingDatabase(): Promise<void> {
  await pool.query('SELECT 1');
}

export async function closeDatabase(): Promise<void> {
  await pool.end();
}
