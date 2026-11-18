import { sql, type SQL } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { employeeAuditEvents } from '../../db/schema/index.js';
import { AppError } from '../../shared/errors.js';
import { assertSupportedTimezone } from '../../shared/timezone.js';
import type { Role } from '../../shared/roles.js';
import type { AuthContext } from '../auth/service.js';
import type {
  CreateEmployee, EmployeeListQuery, EmployeePatch, EmployeeProfile, SelfProfilePatch,
} from './schemas.js';

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type ProfileRow = Omit<EmployeeProfile, 'createdAt' | 'updatedAt'> & {
  department: string | null;
  designation: string | null;
  phoneNumber: string | null;
  address: string | null;
  // Drizzle's raw execute() leaves PostgreSQL timestamps as strings.
  createdAt: string;
  updatedAt: string;
};
const safeColumns = sql`id, name, email, role, is_active AS "isActive", timezone,
  department, designation, phone_number AS "phoneNumber", address,
  google_sub IS NOT NULL AS "identityBound", created_at AS "createdAt", updated_at AS "updatedAt"`;
const profile = (row: ProfileRow): EmployeeProfile => ({
  id: row.id, name: row.name, email: row.email, role: row.role,
  isActive: row.isActive, timezone: row.timezone, identityBound: row.identityBound,
  createdAt: new Date(row.createdAt).toISOString(), updatedAt: new Date(row.updatedAt).toISOString(),
  ...(row.department !== null && row.department !== undefined ? { department: row.department } : {}),
  ...(row.designation !== null && row.designation !== undefined ? { designation: row.designation } : {}),
  ...(row.phoneNumber !== null && row.phoneNumber !== undefined ? { phoneNumber: row.phoneNumber } : {}),
  ...(row.address !== null && row.address !== undefined ? { address: row.address } : {}),
});

/** Lock employees before sessions, in ID order. Recheck current state after waiting.
 * All administrative writes also take the bootstrap-compatible advisory lock,
 * before row locks: last-admin checks and writes are one serialized operation.
 * Self-service takes its employee row lock, so deactivation cannot be bypassed.
 */
async function authorize(
  tx: Transaction, auth: AuthContext, admin: boolean, targetId = auth.employeeId,
): Promise<ProfileRow> {
  const locked = await tx.execute<ProfileRow>(sql`
    SELECT ${safeColumns} FROM employees
    WHERE id IN (${auth.employeeId}, ${targetId}) ORDER BY id FOR UPDATE
  `);
  const actor = locked.rows.find((row) => row.id === auth.employeeId);
  if (!actor?.isActive) throw new AppError('Authentication required', 401);
  const session = await tx.execute(sql`
    SELECT id FROM sessions WHERE id = ${auth.sessionId} AND employee_id = ${actor.id}
      AND revoked_at IS NULL AND idle_expires_at > clock_timestamp()
      AND absolute_expires_at > clock_timestamp() FOR UPDATE
  `);
  if (!session.rows[0]) throw new AppError('Authentication required', 401);
  if (admin && actor.role !== 'admin') throw new AppError('Insufficient role', 403);
  const target = locked.rows.find((row) => row.id === targetId);
  if (!target) throw new AppError('Employee not found', 404);
  return target;
}

async function adminLock(tx: Transaction): Promise<void> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('transacty:bootstrap:admin'))`);
}

async function audit(
  tx: Transaction, auth: AuthContext, targetId: string, action: string,
  changedFields: string[], before: AccessState | null = null, after: AccessState | null = null,
): Promise<void> {
  await tx.insert(employeeAuditEvents).values({
    actorId: auth.employeeId, targetId, action, changedFields, before, after,
  });
}
type AccessState = { role?: Role; isActive?: boolean; timezone?: string | null };

/** Retain only a validated SQLSTATE, never Drizzle's SQL/parameters or PG detail. */
function databaseErrorCode(error: unknown): string | undefined {
  let current = error;
  for (let depth = 0; depth < 5 && typeof current === 'object' && current !== null; depth++) {
    const entry = current as { code?: unknown; cause?: unknown };
    if (typeof entry.code === 'string' && /^[0-9A-Z]{5}$/.test(entry.code)) return entry.code;
    current = entry.cause;
  }
  return undefined;
}

class EmployeeDatabaseError extends Error {
  readonly databaseCode: string | undefined;

  constructor(code: string | undefined) {
    super(code === '42P01' || code === '42703'
      ? 'Employee database schema is incomplete. Review and apply pending migrations to the confirmed database.'
      : 'Employee database operation failed');
    this.name = 'EmployeeDatabaseError';
    this.databaseCode = code;
  }
}

async function employeeTransaction<T>(operation: (tx: Transaction) => Promise<T>): Promise<T> {
  try {
    return await db.transaction(operation);
  } catch (error) {
    if (error instanceof AppError) throw error;
    const code = databaseErrorCode(error);
    if (code === '23505') {
      throw new AppError('Employee email already exists', 409);
    }
    // Drizzle errors embed SQL parameters (including profile values). Do not
    // pass those errors/causes to the central logger. Safe SQLSTATE diagnostics
    // stay server-side; the existing error handler returns a generic HTTP 500.
    throw new EmployeeDatabaseError(code);
  }
}

export async function getEmployeeProfile(auth: AuthContext, id = auth.employeeId, admin = false) {
  return employeeTransaction(async (tx) => profile(await authorize(tx, auth, admin, id)));
}

export async function listEmployees(auth: AuthContext, query: EmployeeListQuery) {
  return employeeTransaction(async (tx) => {
    await authorize(tx, auth, true);
    const conditions: SQL[] = [sql`true`];
    if (query.role !== undefined) conditions.push(sql`role = ${query.role}`);
    if (query.isActive !== undefined) conditions.push(sql`is_active = ${query.isActive}`);
    if (query.department !== undefined) conditions.push(sql`department = ${query.department}`);
    if (query.search !== undefined) {
      // Treat %, _ and backslash literally, not as caller-controlled LIKE patterns.
      const pattern = `%${query.search.replace(/[\\%_]/g, '\\$&')}%`;
      conditions.push(sql`(name ILIKE ${pattern} OR email ILIKE ${pattern} OR department ILIKE ${pattern} OR designation ILIKE ${pattern})`);
    }
    const result = await tx.execute<ProfileRow>(sql`
      SELECT ${safeColumns} FROM employees WHERE ${sql.join(conditions, sql` AND `)}
      ORDER BY created_at, id LIMIT ${query.limit} OFFSET ${query.offset}
    `);
    return { employees: result.rows.map(profile), limit: query.limit, offset: query.offset };
  });
}

export async function createEmployee(auth: AuthContext, input: CreateEmployee) {
  return employeeTransaction(async (tx) => {
    await adminLock(tx);
    await authorize(tx, auth, true);
    await assertSupportedTimezone(tx, input.timezone, 'Provisioning');
    const result = await tx.execute<ProfileRow>(sql`
      INSERT INTO employees (name, email, role, is_active, timezone, department, designation, phone_number, address, google_sub)
      VALUES (${input.name}, ${input.email}, 'employee', true, ${input.timezone}, ${input.department ?? null}, ${input.designation ?? null}, ${input.phoneNumber ?? null}, ${input.address ?? null}, NULL)
      RETURNING ${safeColumns}
    `);
    const employee = result.rows[0]!;
    await audit(tx, auth, employee.id, 'employee.created', ['name', 'email', 'role', 'isActive', 'timezone'],
      null, { role: 'employee', isActive: true });
    return profile(employee);
  });
}

export async function updateSelfProfile(auth: AuthContext, input: SelfProfilePatch) {
  return employeeTransaction(async (tx) => {
    const current = await authorize(tx, auth, false);
    const changes: SQL[] = [];
    const fields: string[] = [];
    if (input.name !== undefined && input.name !== current.name) {
      changes.push(sql`name = ${input.name}`);
      fields.push('name');
    }
    if (input.phoneNumber !== undefined && input.phoneNumber !== current.phoneNumber) {
      changes.push(sql`phone_number = ${input.phoneNumber}`);
      fields.push('phoneNumber');
    }
    if (input.address !== undefined && input.address !== current.address) {
      changes.push(sql`address = ${input.address}`);
      fields.push('address');
    }
    if (input.designation !== undefined && input.designation !== current.designation) {
      changes.push(sql`designation = ${input.designation}`);
      fields.push('designation');
    }
    if (changes.length === 0) return profile(current);
    changes.push(sql`updated_at = now()`);
    const result = await tx.execute<ProfileRow>(sql`
      UPDATE employees SET ${sql.join(changes, sql`, `)}
      WHERE id = ${auth.employeeId} RETURNING ${safeColumns}
    `);
    await audit(tx, auth, auth.employeeId, 'employee.profile_updated', fields);
    return profile(result.rows[0]!);
  });
}

async function protectLastAdmin(tx: Transaction, current: ProfileRow): Promise<void> {
  if (current.role !== 'admin' || !current.isActive) return;
  // Every operation changing role/isActive holds adminLock through commit.
  const others = await tx.execute(sql`
    SELECT id FROM employees WHERE role = 'admin' AND is_active AND id <> ${current.id} LIMIT 1
  `);
  if (!others.rows[0]) throw new AppError('Cannot remove the last active admin', 409);
}

async function revokeSessions(tx: Transaction, id: string): Promise<void> {
  await tx.execute(sql`UPDATE sessions SET revoked_at = now()
    WHERE employee_id = ${id} AND revoked_at IS NULL`);
}

export async function updateEmployee(auth: AuthContext, id: string, input: EmployeePatch) {
  return employeeTransaction(async (tx) => {
    await adminLock(tx);
    const current = await authorize(tx, auth, true, id);
    if (input.isActive === false && id === auth.employeeId) {
      throw new AppError('Cannot deactivate your own account', 409);
    }
    if (input.email !== undefined && input.email !== current.email && current.identityBound) {
      throw new AppError('Email cannot change after identity binding', 409);
    }
    const changes: SQL[] = [];
    const fields: string[] = [];
    if (input.name !== undefined && input.name !== current.name) {
      changes.push(sql`name = ${input.name}`);
      fields.push('name');
    }
    if (input.email !== undefined && input.email !== current.email) {
      changes.push(sql`email = ${input.email}`);
      fields.push('email');
    }
    if (input.isActive !== undefined && input.isActive !== current.isActive) {
      if (!input.isActive) await protectLastAdmin(tx, current);
      changes.push(sql`is_active = ${input.isActive}`);
      fields.push('isActive');
    }
    let changedTimezone: string | null = null;
    if (input.timezone !== undefined && input.timezone !== current.timezone) {
      // The target employee row is FOR UPDATE-locked above, the same lock a
      // check-in transaction takes, so this decision serializes with check-in.
      const open = await tx.execute(sql`
        SELECT id FROM attendance WHERE employee_id = ${id} AND checked_out_at IS NULL LIMIT 1
      `);
      if (open.rows[0]) {
        throw new AppError('Timezone cannot change while an attendance session is open', 409);
      }
      changedTimezone = input.timezone;
      await assertSupportedTimezone(tx, changedTimezone, 'The timezone change');
      changes.push(sql`timezone = ${changedTimezone}`);
      fields.push('timezone');
    }
    if (input.department !== undefined && input.department !== current.department) {
      changes.push(sql`department = ${input.department}`);
      fields.push('department');
    }
    if (input.designation !== undefined && input.designation !== current.designation) {
      changes.push(sql`designation = ${input.designation}`);
      fields.push('designation');
    }
    if (input.phoneNumber !== undefined && input.phoneNumber !== current.phoneNumber) {
      changes.push(sql`phone_number = ${input.phoneNumber}`);
      fields.push('phoneNumber');
    }
    if (input.address !== undefined && input.address !== current.address) {
      changes.push(sql`address = ${input.address}`);
      fields.push('address');
    }
    if (changes.length === 0) return profile(current);
    changes.push(sql`updated_at = now()`);
    const result = await tx.execute<ProfileRow>(sql`
      UPDATE employees SET ${sql.join(changes, sql`, `)} WHERE id = ${id}
      RETURNING ${safeColumns}
    `);
    const profileFields = fields.filter((f) => ['name', 'department', 'designation', 'phoneNumber', 'address'].includes(f));
    if (profileFields.length > 0) await audit(tx, auth, id, 'employee.profile_updated', profileFields);
    if (fields.includes('email')) await audit(tx, auth, id, 'employee.email_changed', ['email']);
    if (fields.includes('timezone')) {
      await audit(tx, auth, id, 'employee.timezone_changed', ['timezone'],
        { timezone: current.timezone }, { timezone: changedTimezone });
    }
    if (fields.includes('isActive')) {
      if (!input.isActive) await revokeSessions(tx, id);
      await audit(tx, auth, id, input.isActive ? 'employee.reactivated' : 'employee.deactivated',
        ['isActive'], { isActive: current.isActive }, { isActive: input.isActive! });
    }
    return profile(result.rows[0]!);
  });
}

export async function changeEmployeeRole(auth: AuthContext, id: string, role: Role) {
  return employeeTransaction(async (tx) => {
    await adminLock(tx);
    const current = await authorize(tx, auth, true, id);
    if (current.role === role) return profile(current);
    if (role === 'employee') await protectLastAdmin(tx, current);
    const result = await tx.execute<ProfileRow>(sql`
      UPDATE employees SET role = ${role}, updated_at = now() WHERE id = ${id}
      RETURNING ${safeColumns}
    `);
    await revokeSessions(tx, id);
    await audit(tx, auth, id, 'employee.role_changed', ['role'], { role: current.role }, { role });
    return profile(result.rows[0]!);
  });
}
