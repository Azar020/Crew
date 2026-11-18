import { sql, type SQL } from 'drizzle-orm';
import { attendanceAuditEvents } from '../../db/schema/index.js';
import type { AuthContext } from '../auth/service.js';
import { AppError } from '../../shared/errors.js';
import { withRecordAccess, type RecordTransaction } from '../../shared/record-access.js';
import { assertSupportedTimezone } from '../../shared/timezone.js';
import type { AttendanceAdminListQuery, AttendanceListQuery } from './schemas.js';

type AttendanceRow = {
  id: string; employeeId: string; workDate: string; timezoneAtCheckIn: string;
  checkedInAt: string; checkedOutAt: string | null; createdAt: string; updatedAt: string;
};
type DurationRow = AttendanceRow & { sessionDurationSeconds: number };
const columns = sql`id, employee_id AS "employeeId", work_date AS "workDate",
  timezone_at_check_in AS "timezoneAtCheckIn", checked_in_at AS "checkedInAt",
  checked_out_at AS "checkedOutAt", created_at AS "createdAt", updated_at AS "updatedAt"`;
const response = (row: AttendanceRow) => ({
  id: row.id, employeeId: row.employeeId, workDate: row.workDate,
  timezoneAtCheckIn: row.timezoneAtCheckIn,
  checkedInAt: new Date(row.checkedInAt).toISOString(),
  checkedOutAt: row.checkedOutAt === null ? null : new Date(row.checkedOutAt).toISOString(),
  createdAt: new Date(row.createdAt).toISOString(), updatedAt: new Date(row.updatedAt).toISOString(),
});
const conflictOptions = { exclusiveEmployee: true, conflicts: [
  { code: '23505', constraint: 'attendance_open_session_unique_idx', message: 'An attendance session is already open' },
  { code: '23505', constraint: 'attendance_employee_work_date_unique_idx', message: 'Attendance has already been recorded for this work date' },
] as const };

async function audit(tx: RecordTransaction, auth: AuthContext, attendanceId: string, action: string, changedFields: string[]) {
  await tx.insert(attendanceAuditEvents).values({ actorId: auth.employeeId, attendanceId, action, changedFields });
}

/** Reads the employee's configured work timezone inside an already-locked
 * transaction. Attendance fails closed (400, never a fake auth error) until
 * an admin sets an explicit timezone; existing rows are never defaulted.
 */
async function workTimezone(tx: RecordTransaction, employeeId: string): Promise<string> {
  const row = (await tx.execute<{ timezone: string | null }>(sql`
    SELECT timezone FROM employees WHERE id = ${employeeId}
  `)).rows[0];
  if (!row?.timezone) {
    throw new AppError('Attendance is not configured for this account yet: ask an administrator to set your work timezone', 400);
  }
  await assertSupportedTimezone(tx, row.timezone, 'Attendance');
  return row.timezone;
}

/** ONE database instant, captured by the caller AFTER locks, with the
 * employee-local calendar date derived from that same instant. The server's
 * physical timezone and the client clock are never consulted.
 */
async function captureInstant(tx: RecordTransaction, timezone: string, at?: Date) {
  const result = await tx.execute<{ at: string; workDate: string }>(sql`
    SELECT captured.at AS "at", (captured.at AT TIME ZONE ${timezone})::date AS "workDate"
    FROM (SELECT ${at ?? sql`clock_timestamp()`}::timestamptz AS at) captured
  `);
  const instant = result.rows[0]!;
  return { at: instant.at, workDate: instant.workDate };
}

export async function checkIn(auth: AuthContext, options: { at?: Date } = {}) {
  return withRecordAccess(auth, async (tx) => {
    const timezone = await workTimezone(tx, auth.employeeId);
    const instant = await captureInstant(tx, timezone, options.at);
    // Both decisions run under the exclusive employee lock, serialized against
    // concurrent check-ins and timezone changes; the unique indexes below are
    // the concurrency backstop, never the only guard.
    const open = await tx.execute(sql`
      SELECT id FROM attendance WHERE employee_id = ${auth.employeeId} AND checked_out_at IS NULL LIMIT 1
    `);
    if (open.rows[0]) throw new AppError('An attendance session is already open', 409);
    const sameDate = await tx.execute(sql`
      SELECT id FROM attendance WHERE employee_id = ${auth.employeeId} AND work_date = ${instant.workDate}::date LIMIT 1
    `);
    if (sameDate.rows[0]) {
      throw new AppError('Attendance has already been recorded for this work date', 409);
    }
    const result = await tx.execute<AttendanceRow>(sql`
      INSERT INTO attendance (employee_id, work_date, timezone_at_check_in, checked_in_at)
      VALUES (${auth.employeeId}, ${instant.workDate}, ${timezone}, ${instant.at})
      RETURNING ${columns}
    `);
    const row = result.rows[0]!;
    await audit(tx, auth, row.id, 'attendance.checked_in', ['checkedInAt']);
    return response(row);
  }, conflictOptions);
}

export async function checkOut(auth: AuthContext, options: { at?: Date } = {}) {
  return withRecordAccess(auth, async (tx) => {
    // Row lock: a concurrent checkout waits, then no longer finds an open
    // session, and fails with 409 instead of overwriting the first close.
    const open = (await tx.execute<AttendanceRow>(sql`
      SELECT ${columns} FROM attendance
      WHERE employee_id = ${auth.employeeId} AND checked_out_at IS NULL FOR UPDATE
    `)).rows[0];
    if (!open) throw new AppError('No open attendance session', 409);
    const instant = await captureInstant(tx, open.timezoneAtCheckIn, options.at);
    await tx.execute(sql`
      UPDATE attendance_breaks SET ended_at = ${instant.at}, updated_at = now()
      WHERE attendance_id = ${open.id} AND ended_at IS NULL
    `);
    const result = await tx.execute<DurationRow>(sql`
      UPDATE attendance SET checked_out_at = ${instant.at}, updated_at = now()
      WHERE id = ${open.id} RETURNING ${columns},
        EXTRACT(EPOCH FROM (checked_out_at - checked_in_at))::int AS "sessionDurationSeconds"
    `);
    const row = result.rows[0]!;
    await audit(tx, auth, row.id, 'attendance.checked_out', ['checkedOutAt']);
    return { attendance: response(row), sessionDurationSeconds: row.sessionDurationSeconds };
  }, { exclusiveEmployee: true });
}

/** Single consistent snapshot (repeatable read) for the frontend flags. These
 * are advisory only: mutations independently revalidate every rule.
 */
export async function getAttendanceStatus(auth: AuthContext) {
  return withRecordAccess(auth, async (tx) => {
    const employee = (await tx.execute<{ timezone: string | null }>(sql`
      SELECT timezone FROM employees WHERE id = ${auth.employeeId}
    `)).rows[0]!;
    const timezone = employee.timezone;
    let localDate: string | null = null;
    if (timezone) {
      localDate = (await tx.execute<{ d: string }>(sql`
        SELECT (clock_timestamp() AT TIME ZONE ${timezone})::date AS d
      `)).rows[0]!.d;
    }
    const open = (await tx.execute<AttendanceRow>(sql`
      SELECT ${columns} FROM attendance WHERE employee_id = ${auth.employeeId} AND checked_out_at IS NULL
      ORDER BY checked_in_at DESC, id DESC LIMIT 1
    `)).rows[0];
    if (open) {
      // An open session from a previous day takes precedence over today.
      return {
        timezone, localDate, state: 'checked_in' as const,
        canCheckIn: false, canCheckOut: true,
        openSession: response(open), todayCompletedRecord: null,
      };
    }
    const todayCompleted = localDate === null ? undefined : (await tx.execute<AttendanceRow>(sql`
      SELECT ${columns} FROM attendance
      WHERE employee_id = ${auth.employeeId} AND work_date = ${localDate}::date AND checked_out_at IS NOT NULL
      ORDER BY checked_in_at DESC, id DESC LIMIT 1
    `)).rows[0];
    if (todayCompleted) {
      return {
        timezone, localDate, state: 'checked_out' as const,
        canCheckIn: false, canCheckOut: false,
        openSession: null, todayCompletedRecord: response(todayCompleted),
      };
    }
    return {
      timezone, localDate, state: 'not_checked_in' as const,
      canCheckIn: timezone !== null, canCheckOut: false,
      openSession: null, todayCompletedRecord: null,
    };
  }, { isolation: 'repeatable read' });
}

export async function listMyAttendance(auth: AuthContext, query: AttendanceListQuery) {
  return withRecordAccess(auth, async (tx) => {
    const conditions: SQL[] = [sql`employee_id = ${auth.employeeId}`];
    if (query.fromDate !== undefined) conditions.push(sql`work_date >= ${query.fromDate}::date`);
    if (query.toDate !== undefined) conditions.push(sql`work_date <= ${query.toDate}::date`);
    const result = await tx.execute<AttendanceRow>(sql`
      SELECT ${columns} FROM attendance WHERE ${sql.join(conditions, sql` AND `)}
      ORDER BY checked_in_at DESC, id DESC LIMIT ${query.limit} OFFSET ${query.offset}
    `);
    return { attendance: result.rows.map(response), limit: query.limit, offset: query.offset };
  });
}

export async function listAttendance(auth: AuthContext, query: AttendanceAdminListQuery) {
  return withRecordAccess(auth, async (tx) => {
    const conditions: SQL[] = [sql`true`];
    if (query.employeeId !== undefined) conditions.push(sql`employee_id = ${query.employeeId}`);
    if (query.fromDate !== undefined) conditions.push(sql`work_date >= ${query.fromDate}::date`);
    if (query.toDate !== undefined) conditions.push(sql`work_date <= ${query.toDate}::date`);
    const result = await tx.execute<AttendanceRow>(sql`
      SELECT ${columns} FROM attendance WHERE ${sql.join(conditions, sql` AND `)}
      ORDER BY checked_in_at DESC, id DESC LIMIT ${query.limit} OFFSET ${query.offset}
    `);
    return { attendance: result.rows.map(response), limit: query.limit, offset: query.offset };
  }, { admin: true });
}
