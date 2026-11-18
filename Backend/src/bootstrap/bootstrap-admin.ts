import { BOOTSTRAP_ALLOWED_EMAIL_DOMAINS } from '../modules/auth/constants.js';
import { applicationSupportsTimezone } from '../shared/timezone.js';
import { hashPassword } from '../shared/hashing.js';

/**
 * Controlled first-admin bootstrap logic.
 *
 * This runs ONLY as a manual CLI script (npm run bootstrap:admin). It is
 * deliberately NOT exposed through any HTTP route. The bootstrap:
 * - accepts a single company email (and optional name),
 * - allows only the company domains (same allowlist as login),
 * - creates an active admin WITHOUT a Google identity bound,
 * - refuses when the email already exists or any admin already exists,
 * - is concurrency-safe: the check-then-insert runs inside one transaction
 *   holding a PostgreSQL advisory lock, so two simultaneous invocations
 *   cannot both succeed.
 */

export type BootstrapRefusal =
  | 'invalid-email'
  | 'disallowed-domain'
  | 'invalid-timezone'
  | 'admin-exists'
  | 'employee-exists';

export class BootstrapError extends Error {
  readonly reason: BootstrapRefusal;

  constructor(reason: BootstrapRefusal, message: string) {
    super(message);
    this.name = 'BootstrapError';
    this.reason = reason;
  }
}

export interface BootstrapedAdmin {
  id: string;
  email: string;
  name: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeBootstrapEmail(rawEmail: string): string {
  const email = rawEmail.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(email)) {
    throw new BootstrapError('invalid-email', `Not a valid email address: ${rawEmail}`);
  }
  const domain = email.split('@')[1] ?? '';
  if (!(BOOTSTRAP_ALLOWED_EMAIL_DOMAINS as readonly string[]).includes(domain)) {
    throw new BootstrapError(
      'disallowed-domain',
      `Domain "${domain}" is not allowed. Allowed: ${BOOTSTRAP_ALLOWED_EMAIL_DOMAINS.join(', ')}`,
    );
  }
  return email;
}

/** Derives a display name from the email local part when --name is absent. */
export function deriveNameFromEmail(email: string): string {
  const local = email.split('@')[0] ?? '';
  const parts = local.split(/[._-]+/).filter((p) => p.length > 0);
  const name = parts
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
  return name || local;
}

/**
 * Runs the bootstrap inside a single transaction guarded by an advisory
 * lock. `pool` is injected so callers (CLI, tests) control the database.
 */
export async function bootstrapFirstAdmin(
  pool: PgPoolLike,
  rawEmail: string,
  rawName?: string,
  rawTimezone?: string,
  rawPassword?: string,
): Promise<BootstrapedAdmin> {
  const email = normalizeBootstrapEmail(rawEmail);
  const name = (rawName?.trim() || deriveNameFromEmail(email)).slice(0, 200);
  const passwordHash = rawPassword ? await hashPassword(rawPassword) : null;
  // Optional: the operator may set the admin's work timezone at bootstrap.
  // When omitted the row stays unconfigured (attendance blocked later) —
  // a timezone is never silently invented. IANA names only.
  const timezone = rawTimezone === undefined ? undefined
    : (() => {
      const trimmed = rawTimezone.trim();
      if (!applicationSupportsTimezone(trimmed)) {
        throw new BootstrapError('invalid-timezone', `Not a supported IANA timezone: ${rawTimezone}`);
      }
      return trimmed;
    })();

  const connection = await pool.connect();
  try {
    await connection.query('BEGIN');
    // Advisory transaction-scoped lock serializes concurrent bootstraps.
    await connection.query(
      "SELECT pg_advisory_xact_lock(hashtext('transacty:bootstrap:admin'))",
    );

    const adminRows = await connection.query(
      'SELECT id FROM employees WHERE role = $1 LIMIT 1',
      ['admin'],
    );
    if (adminRows.rows.length > 0) {
      await connection.query('ROLLBACK');
      throw new BootstrapError(
        'admin-exists',
        'Bootstrap refused: an admin already exists. Use admin management instead.',
      );
    }

    const employeeRows = await connection.query(
      'SELECT id FROM employees WHERE email = $1',
      [email],
    );
    if (employeeRows.rows.length > 0) {
      await connection.query('ROLLBACK');
      throw new BootstrapError(
        'employee-exists',
        'Bootstrap refused: an employee record with this email already exists.',
      );
    }

    const inserted = await connection.query(
      `INSERT INTO employees (name, email, role, is_active, timezone, password_hash)
       VALUES ($1, $2, 'admin', true, $3, $4)
       RETURNING id, email, name`,
      [name, email, timezone ?? null, passwordHash],
    );
    await connection.query('COMMIT');

    const row = inserted.rows[0] as unknown as BootstrapedAdmin;
    if (!row) throw new BootstrapError('invalid-email', 'Insert failed');
    return row;
  } catch (error) {
    // Best-effort rollback if the transaction is still open.
    try {
      await connection.query('ROLLBACK');
    } catch {
      /* already rolled back or not open */
    }
    throw error;
  } finally {
    connection.release();
  }
}

interface PgClientLike {
  query: (text: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
  release: () => void;
}

interface PgPoolLike {
  connect: () => Promise<PgClientLike>;
}
