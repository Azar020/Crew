import { sql } from 'drizzle-orm';
import { holidayAuditEvents } from '../../db/schema/index.js';
import type { AuthContext } from '../auth/service.js';
import { AppError } from '../../shared/errors.js';
import { withRecordAccess, type RecordTransaction } from '../../shared/record-access.js';
import type { CreateHoliday, HolidayListQuery, PatchHoliday } from './schemas.js';

type HolidayRow = { id: string; name: string; date: string; createdAt: string; updatedAt: string };
const columns = sql`id, name, date, created_at AS "createdAt", updated_at AS "updatedAt"`;
const response = (row: HolidayRow) => ({
  id: row.id, name: row.name, date: row.date,
  createdAt: new Date(row.createdAt).toISOString(), updatedAt: new Date(row.updatedAt).toISOString(),
});
const mutationOptions = { admin: true, conflicts: [
  { code: '23505', constraint: 'holidays_date_unique_idx', message: 'A holiday already exists on this date' },
] };

async function audit(tx: RecordTransaction, auth: AuthContext, id: string, action: string, changedFields: string[]) {
  await tx.insert(holidayAuditEvents).values({ actorId: auth.employeeId, holidayId: id, action, changedFields });
}

export async function listHolidays(auth: AuthContext, query: HolidayListQuery) {
  return withRecordAccess(auth, async (tx) => {
    const year = String(query.year).padStart(4, '0');
    const result = await tx.execute<HolidayRow>(sql`
      SELECT ${columns} FROM holidays WHERE date BETWEEN ${year + '-01-01'}::date AND ${year + '-12-31'}::date
      ORDER BY date ASC, id ASC LIMIT ${query.limit} OFFSET ${query.offset}
    `);
    return { holidays: result.rows.map(response), limit: query.limit, offset: query.offset };
  });
}

export async function createHoliday(auth: AuthContext, input: CreateHoliday) {
  return withRecordAccess(auth, async (tx) => {
    const result = await tx.execute<HolidayRow>(sql`
      INSERT INTO holidays (name, date, created_by) VALUES (${input.name}, ${input.date}, ${auth.employeeId})
      RETURNING ${columns}
    `);
    const row = result.rows[0]!;
    await audit(tx, auth, row.id, 'holiday.created', ['name', 'date']);
    return response(row);
  }, mutationOptions);
}

/** Admin-only partial replacement of PUT. The row is locked, merged with the
 * patch, and only actually changed fields are written and audited; a no-op
 * patch changes nothing (timestamps included). Fields are written explicitly.
 */
export async function patchHoliday(auth: AuthContext, id: string, patch: PatchHoliday) {
  return withRecordAccess(auth, async (tx) => {
    const current = (await tx.execute<HolidayRow>(sql`SELECT ${columns} FROM holidays WHERE id = ${id} FOR UPDATE`)).rows[0];
    if (!current) throw new AppError('Holiday not found', 404);
    const merged = { name: patch.name ?? current.name, date: patch.date ?? current.date };
    const changedFields: string[] = [];
    if (merged.name !== current.name) changedFields.push('name');
    if (merged.date !== current.date) changedFields.push('date');
    if (changedFields.length === 0) return response(current);
    const result = await tx.execute<HolidayRow>(sql`
      UPDATE holidays SET name = ${merged.name}, date = ${merged.date}, updated_at = now()
      WHERE id = ${id} RETURNING ${columns}
    `);
    await audit(tx, auth, id, 'holiday.updated', changedFields);
    return response(result.rows[0]!);
  }, mutationOptions);
}

export async function removeHoliday(auth: AuthContext, id: string): Promise<void> {
  return withRecordAccess(auth, async (tx) => {
    const result = await tx.execute(sql`DELETE FROM holidays WHERE id = ${id} RETURNING id`);
    if (!result.rows[0]) throw new AppError('Holiday not found', 404);
    await audit(tx, auth, id, 'holiday.deleted', ['name', 'date']);
  }, { admin: true });
}
