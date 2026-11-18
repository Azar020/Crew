import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import type { AuthContext } from '../modules/auth/service.js';
import type { Role } from './roles.js';
import { AppError } from './errors.js';
import type { RecordListQuery } from './record-schemas.js';

export type RecordTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export interface ConstraintConflict { code: string; constraint: string; message: string }

/** Database failures often contain SQL parameters. Only SQLSTATE survives logging. */
export class RecordDatabaseError extends Error {
  readonly databaseCode: string | undefined;
  constructor(code: string | undefined) {
    super(code === '42P01' || code === '42703'
      ? 'Business schema is incomplete; review pending migrations for the confirmed database.'
      : 'Business database operation failed');
    this.name = 'RecordDatabaseError';
    this.databaseCode = code;
  }
}

export function safeRecordError(error: unknown, conflicts: readonly ConstraintConflict[] = []): Error {
  if (error instanceof AppError || error instanceof RecordDatabaseError) return error;
  let current = error;
  for (let depth = 0; depth < 5 && current !== null && typeof current === 'object'; depth++) {
    const entry = current as { code?: unknown; constraint?: unknown; cause?: unknown };
    if (typeof entry.code === 'string' && /^[0-9A-Z]{5}$/.test(entry.code)) {
      const conflict = conflicts.find((item) => item.code === entry.code && item.constraint === entry.constraint);
      return conflict ? new AppError(conflict.message, 409) : new RecordDatabaseError(entry.code);
    }
    current = entry.cause;
  }
  return new RecordDatabaseError(undefined);
}

/** Same employee-before-session lock order as access management. Authorization
 * is rechecked after waiting, and locks prevent mid-operation deactivation/logout.
 * Leave creation uses an exclusive employee lock to serialize overlap decisions.
 */
export async function withRecordAccess<T>(
  auth: AuthContext,
  operation: (tx: RecordTransaction, role: Role) => Promise<T>,
  options: { admin?: boolean; exclusiveEmployee?: boolean; conflicts?: readonly ConstraintConflict[];
    isolation?: 'repeatable read' } = {},
): Promise<T> {
  try {
    return await db.transaction(async (tx) => {
      const lock = options.exclusiveEmployee ? sql`FOR UPDATE` : sql`FOR SHARE`;
      const result = await tx.execute<{ role: Role; is_active: boolean }>(sql`
        SELECT role, is_active FROM employees WHERE id = ${auth.employeeId} ${lock}
      `);
      const actor = result.rows[0];
      if (!actor?.is_active) throw new AppError('Authentication required', 401);
      const session = await tx.execute(sql`
        SELECT id FROM sessions WHERE id = ${auth.sessionId} AND employee_id = ${auth.employeeId}
          AND revoked_at IS NULL AND idle_expires_at > clock_timestamp()
          AND absolute_expires_at > clock_timestamp() FOR SHARE
      `);
      if (!session.rows[0]) throw new AppError('Authentication required', 401);
      if (options.admin && actor.role !== 'admin') throw new AppError('Insufficient role', 403);
      return operation(tx, actor.role);
    }, options.isolation ? { isolationLevel: options.isolation } : undefined);
  } catch (error) {
    throw safeRecordError(error, options.conflicts);
  }
}

/** Undefined means all records, and is returned only for a current admin. */
export function listOwner(auth: AuthContext, role: Role, query: RecordListQuery): string | undefined {
  if (query.scope === 'all') {
    if (role !== 'admin') throw new AppError('Insufficient role', 403);
    return query.employeeId;
  }
  if (query.employeeId !== undefined) {
    throw new AppError('employeeId filter requires admin scope=all', 403);
  }
  return auth.employeeId;
}
