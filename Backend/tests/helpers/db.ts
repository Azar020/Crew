import pg from 'pg';

import { TEST_DATABASE_URL } from '../database-config.js';
export { TEST_DATABASE_URL } from '../database-config.js';

/**
 * The application reads `date` columns as plain 'YYYY-MM-DD' strings (drizzle's
 * node-postgres driver configures its parsers that way). A raw pg pool parses
 * `date` into local-midnight JS Date objects, which silently breaks direct
 * comparisons against stored values. Give the direct-manipulation pool the
 * same date semantics as the application under test.
 */
const dateAsStringTypes = {
  getTypeParser(typeId: number, format?: 'text' | 'binary'): (value: string) => unknown {
    const original = pg.types.getTypeParser(typeId, format);
    if (typeId === 1082) return (value) => value; // PostgreSQL `date`
    return original as (value: string) => unknown;
  },
};

let availabilityPromise: Promise<boolean> | null = null;

/** Resolves once per process; true when the test database is reachable. */
export function databaseAvailable(): Promise<boolean> {
  availabilityPromise ??= (async () => {
    const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL });
    try {
      await pool.query('SELECT 1');
      return true;
    } catch {
      return false;
    } finally {
      await pool.end();
    }
  })();
  return availabilityPromise;
}

let appPool: pg.Pool | null = null;

/** A dedicated pool for direct DB manipulation in tests. */
export function testPool(): pg.Pool {
  appPool ??= new pg.Pool({ connectionString: TEST_DATABASE_URL, types: dateAsStringTypes });
  return appPool;
}

export async function closeTestPool(): Promise<void> {
  if (appPool) {
    await appPool.end();
    appPool = null;
  }
}

/** Removes all auth data between tests (single statement, FK-safe). */
export async function resetTables(): Promise<void> {
  await testPool().query(
    'TRUNCATE TABLE sessions, oauth_transactions, employees RESTART IDENTITY CASCADE',
  );
}

export interface SeedEmployeeOptions {
  email: string;
  name?: string;
  role?: 'admin' | 'employee';
  isActive?: boolean;
  googleSub?: string | null;
  timezone?: string;
  department?: string | null;
  designation?: string | null;
  phoneNumber?: string | null;
  address?: string | null;
}

/** Inserts an employee row directly and returns its id. */
export async function seedEmployee(options: SeedEmployeeOptions): Promise<string> {
  const result = await testPool().query<{ id: string }>(
    `INSERT INTO employees (name, email, role, is_active, google_sub, timezone, department, designation, phone_number, address)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id`,
    [
      options.name ?? options.email.split('@')[0],
      options.email.toLowerCase(),
      options.role ?? 'employee',
      options.isActive ?? true,
      options.googleSub ?? null,
      options.timezone ?? null,
      options.department ?? null,
      options.designation ?? null,
      options.phoneNumber ?? null,
      options.address ?? null,
    ],
  );
  return result.rows[0]!.id;
}

/** Reads a column of an employee row (e.g. google_sub, is_active). */
export async function employeeField(
  employeeId: string,
  field: 'google_sub' | 'is_active' | 'role',
): Promise<unknown> {
  const result = await testPool().query(
    `SELECT ${field} FROM employees WHERE id = $1`,
    [employeeId],
  );
  return result.rows[0]?.[field];
}

/** Reads a session row by token hash. */
export async function sessionRowByTokenHash(token: string): Promise<Record<string, unknown> | undefined> {
  const result = await testPool().query(
    'SELECT * FROM sessions WHERE token_hash = $1',
    // sha256 of token is computed by the app; tests pass pre-hashed values.
    [token],
  );
  return result.rows[0];
}
