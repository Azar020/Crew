import { setTimeout } from 'node:timers/promises';
import { testPool } from './db.js';

/** Observe actual PostgreSQL lock contention, rather than assuming a sleep caused a race. */
export async function waitForBlockedQuery(fragment: string, count = 1): Promise<void> {
  const deadline = Date.now() + 4_000;
  while (Date.now() < deadline) {
    const result = await testPool().query(
      `SELECT 1 FROM pg_stat_activity WHERE datname = current_database()
       AND pid <> pg_backend_pid() AND cardinality(pg_blocking_pids(pid)) > 0
       AND query LIKE $1`, [`%${fragment}%`],
    );
    if ((result.rowCount ?? 0) >= count) return;
    await setTimeout(10);
  }
  throw new Error(`No blocked PostgreSQL query observed: ${fragment}`);
}
