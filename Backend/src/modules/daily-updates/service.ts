import { sql, type SQL } from 'drizzle-orm';
import type { AuthContext } from '../auth/service.js';
import { companyDate } from '../../shared/calendar.js';
import { AppError } from '../../shared/errors.js';
import { listOwner, withRecordAccess } from '../../shared/record-access.js';
import type { RecordListQuery } from '../../shared/record-schemas.js';
import type { CreateDailyUpdate, PatchDailyUpdate } from './schemas.js';

type DailyRow = { id: string; employeeId: string; workDate: string; content: string; createdAt: string; updatedAt: string };
const columns = sql`id, employee_id AS "employeeId", work_date AS "workDate", content,
  created_at AS "createdAt", updated_at AS "updatedAt"`;
const response = (row: DailyRow) => ({
  id: row.id, employeeId: row.employeeId, workDate: row.workDate,
  content: row.content, createdAt: new Date(row.createdAt).toISOString(),
  updatedAt: new Date(row.updatedAt).toISOString(),
});

export async function createDailyUpdate(auth: AuthContext, input: CreateDailyUpdate) {
  return withRecordAccess(auth, async (tx) => {
    if (input.workDate > companyDate()) throw new AppError('Future work dates are not allowed', 400);
    const result = await tx.execute<DailyRow>(sql`
      INSERT INTO daily_updates (employee_id, work_date, content)
      VALUES (${auth.employeeId}, ${input.workDate}, ${input.content}) RETURNING ${columns}
    `);
    return response(result.rows[0]!);
  }, { conflicts: [{ code: '23505', constraint: 'daily_updates_employee_work_date_unique_idx',
    message: 'A daily update already exists for this work date' }] });
}

/** Owner-scoped partial edit; admins cannot edit other employees' updates.
 * The row is locked, merged with the patch, and the FINAL record is revalidated
 * (future dates stay rejected). Uniqueness remains enforced by the database
 * index; conflicts map to 409. Fields are written explicitly, never spread.
 */
export async function patchDailyUpdate(auth: AuthContext, id: string, patch: PatchDailyUpdate) {
  return withRecordAccess(auth, async (tx) => {
    const current = (await tx.execute<DailyRow>(sql`
      SELECT ${columns} FROM daily_updates WHERE id = ${id} AND employee_id = ${auth.employeeId} FOR UPDATE
    `)).rows[0];
    if (!current) throw new AppError('Daily update not found', 404);
    const merged = {
      workDate: patch.workDate ?? current.workDate,
      content: patch.content ?? current.content,
    };
    if (merged.workDate > companyDate()) throw new AppError('Future work dates are not allowed', 400);
    // A no-op patch leaves the record (and its timestamps) untouched.
    if (merged.workDate === current.workDate && merged.content === current.content) return response(current);
    const result = await tx.execute<DailyRow>(sql`
      UPDATE daily_updates SET work_date = ${merged.workDate}, content = ${merged.content}, updated_at = now()
      WHERE id = ${id} RETURNING ${columns}
    `);
    return response(result.rows[0]!);
  }, { conflicts: [{ code: '23505', constraint: 'daily_updates_employee_work_date_unique_idx',
    message: 'A daily update already exists for this work date' }] });
}

export async function listDailyUpdates(auth: AuthContext, query: RecordListQuery) {
  return withRecordAccess(auth, async (tx, role) => {
    const owner = listOwner(auth, role, query);
    const conditions: SQL[] = [sql`true`];
    if (owner !== undefined) conditions.push(sql`d.employee_id = ${owner}`);
    if (query.fromDate !== undefined) conditions.push(sql`d.work_date >= ${query.fromDate}::date`);
    if (query.toDate !== undefined) conditions.push(sql`d.work_date <= ${query.toDate}::date`);
    const result = await tx.execute<DailyRow & {
      empId?: string;
      empName?: string;
      empEmail?: string;
      empDepartment?: string | null;
      empDesignation?: string | null;
    }>(sql`
      SELECT d.id, d.employee_id AS "employeeId", d.work_date AS "workDate", d.content,
        d.created_at AS "createdAt", d.updated_at AS "updatedAt",
        e.id AS "empId", e.name AS "empName", e.email AS "empEmail",
        e.department AS "empDepartment", e.designation AS "empDesignation"
      FROM daily_updates d
      LEFT JOIN employees e ON d.employee_id = e.id
      WHERE ${sql.join(conditions, sql` AND `)}
      ORDER BY d.created_at DESC, d.id DESC LIMIT ${query.limit} OFFSET ${query.offset}
    `);
    return {
      dailyUpdates: result.rows.map((row) => ({
        id: row.id,
        employeeId: row.employeeId,
        workDate: row.workDate,
        content: row.content,
        createdAt: new Date(row.createdAt).toISOString(),
        updatedAt: new Date(row.updatedAt).toISOString(),
        ...(row.empId ? {
          employee: {
            id: row.empId,
            name: row.empName!,
            email: row.empEmail,
            department: row.empDepartment,
            designation: row.empDesignation,
          },
          employeeName: row.empName,
          employeeDepartment: row.empDepartment,
          employeeDesignation: row.empDesignation,
        } : {}),
      })),
      limit: query.limit,
      offset: query.offset,
    };
  });
}
