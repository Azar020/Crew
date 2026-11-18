import { sql } from 'drizzle-orm';
import type { AuthContext } from '../auth/service.js';
import { AppError } from '../../shared/errors.js';
import { withRecordAccess, type RecordTransaction } from '../../shared/record-access.js';
import type { AttendanceBreakRecord } from './schemas.js';

type BreakRow = {
  id: string;
  attendanceId: string;
  employeeId: string;
  startedAt: string;
  endedAt: string | null;
  createdAt: string;
  updatedAt: string;
  durationSeconds?: number | null;
};

const breakColumns = sql`id, attendance_id AS "attendanceId", employee_id AS "employeeId",
  started_at AS "startedAt", ended_at AS "endedAt",
  created_at AS "createdAt", updated_at AS "updatedAt"`;

const conflictOptions = {
  exclusiveEmployee: true,
  conflicts: [
    { code: '23505', constraint: 'attendance_breaks_active_unique_idx', message: 'An active break is already in progress' },
    { code: '23514', constraint: 'attendance_breaks_order_check', message: 'Break end time must be after or equal to start time' },
  ] as const,
};

function formatBreak(row: BreakRow): AttendanceBreakRecord {
  const started = new Date(row.startedAt);
  const ended = row.endedAt ? new Date(row.endedAt) : null;
  let duration: number | null = null;
  if (row.durationSeconds !== undefined && row.durationSeconds !== null) {
    duration = row.durationSeconds;
  } else if (ended) {
    duration = Math.max(0, Math.round((ended.getTime() - started.getTime()) / 1000));
  }
  return {
    id: row.id,
    attendanceId: row.attendanceId,
    employeeId: row.employeeId,
    startedAt: started.toISOString(),
    endedAt: ended ? ended.toISOString() : null,
    durationSeconds: duration,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  };
}

export async function startBreak(
  auth: AuthContext,
  attendanceId: string,
  options: { at?: Date } = {},
): Promise<{ break: AttendanceBreakRecord }> {
  return withRecordAccess(auth, async (tx) => {
    // 1. Verify attendance record exists and belongs to employee
    const attendanceRow = (await tx.execute<{ id: string; employee_id: string; checked_out_at: string | null }>(sql`
      SELECT id, employee_id, checked_out_at FROM attendance WHERE id = ${attendanceId}
    `)).rows[0];

    if (!attendanceRow) {
      throw new AppError('Attendance record not found', 404);
    }

    if (attendanceRow.employee_id !== auth.employeeId) {
      throw new AppError('Cannot manage breaks for another employee', 403);
    }

    if (attendanceRow.checked_out_at !== null) {
      throw new AppError('Cannot start a break on a closed attendance session', 409);
    }

    // 2. Verify no active break is currently in progress for this employee
    const active = (await tx.execute<{ id: string }>(sql`
      SELECT id FROM attendance_breaks WHERE employee_id = ${auth.employeeId} AND ended_at IS NULL LIMIT 1
    `)).rows[0];

    if (active) {
      throw new AppError('An active break is already in progress', 409);
    }

    // 3. Insert new break record
    const startedAt = options.at ? options.at.toISOString() : sql`clock_timestamp()`;
    const result = await tx.execute<BreakRow>(sql`
      INSERT INTO attendance_breaks (attendance_id, employee_id, started_at)
      VALUES (${attendanceId}, ${auth.employeeId}, ${startedAt})
      RETURNING ${breakColumns}
    `);

    const row = result.rows[0]!;
    return { break: formatBreak(row) };
  }, conflictOptions);
}

export async function endBreak(
  auth: AuthContext,
  attendanceId: string,
  breakId: string,
  options: { at?: Date } = {},
): Promise<{ break: AttendanceBreakRecord; durationSeconds: number }> {
  return withRecordAccess(auth, async (tx) => {
    // 1. Verify attendance record exists and belongs to employee
    const attendanceRow = (await tx.execute<{ id: string; employee_id: string }>(sql`
      SELECT id, employee_id FROM attendance WHERE id = ${attendanceId}
    `)).rows[0];

    if (!attendanceRow) {
      throw new AppError('Attendance record not found', 404);
    }

    if (attendanceRow.employee_id !== auth.employeeId) {
      throw new AppError('Cannot manage breaks for another employee', 403);
    }

    // 2. Verify break record exists and is active
    const breakRow = (await tx.execute<BreakRow>(sql`
      SELECT ${breakColumns} FROM attendance_breaks
      WHERE id = ${breakId} AND attendance_id = ${attendanceId}
      FOR UPDATE
    `)).rows[0];

    if (!breakRow) {
      throw new AppError('Break record not found', 404);
    }

    if (breakRow.endedAt !== null) {
      throw new AppError('Break has already ended', 409);
    }

    // 3. End break and calculate duration
    const endedAt = options.at ? options.at.toISOString() : sql`clock_timestamp()`;
    const result = await tx.execute<BreakRow & { durationSeconds: number }>(sql`
      UPDATE attendance_breaks
      SET ended_at = ${endedAt}, updated_at = now()
      WHERE id = ${breakId}
      RETURNING ${breakColumns},
        EXTRACT(EPOCH FROM (ended_at - started_at))::int AS "durationSeconds"
    `);

    const row = result.rows[0]!;
    return {
      break: formatBreak(row),
      durationSeconds: row.durationSeconds,
    };
  }, conflictOptions);
}

export async function listBreaks(
  auth: AuthContext,
  attendanceId: string,
): Promise<{
  breaks: AttendanceBreakRecord[];
  totalBreakDurationSeconds: number;
  activeBreak: AttendanceBreakRecord | null;
}> {
  return withRecordAccess(auth, async (tx, role) => {
    // 1. Verify attendance record exists
    const attendanceRow = (await tx.execute<{ id: string; employee_id: string }>(sql`
      SELECT id, employee_id FROM attendance WHERE id = ${attendanceId}
    `)).rows[0];

    if (!attendanceRow) {
      throw new AppError('Attendance record not found', 404);
    }

    // 2. Authorization: Admin can view any attendance; employee only their own
    if (role !== 'admin' && attendanceRow.employee_id !== auth.employeeId) {
      throw new AppError('Cannot access another employee break records', 403);
    }

    // 3. Query all breaks for this attendance
    const rows = (await tx.execute<BreakRow & { durationSeconds: number | null }>(sql`
      SELECT ${breakColumns},
        CASE WHEN ended_at IS NOT NULL THEN EXTRACT(EPOCH FROM (ended_at - started_at))::int ELSE NULL END AS "durationSeconds"
      FROM attendance_breaks
      WHERE attendance_id = ${attendanceId}
      ORDER BY started_at ASC, id ASC
    `)).rows;

    let totalBreakDurationSeconds = 0;
    let activeBreak: AttendanceBreakRecord | null = null;

    const breaks = rows.map((r) => {
      if (r.durationSeconds !== null && r.durationSeconds !== undefined) {
        totalBreakDurationSeconds += r.durationSeconds;
      }
      const formatted = formatBreak(r);
      if (r.endedAt === null) {
        activeBreak = formatted;
      }
      return formatted;
    });

    return {
      breaks,
      totalBreakDurationSeconds,
      activeBreak,
    };
  });
}

export async function getTotalBreakDuration(
  tx: RecordTransaction,
  attendanceId: string,
): Promise<number> {
  const res = await tx.execute<{ total: number }>(sql`
    SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (ended_at - started_at)))::int, 0) AS total
    FROM attendance_breaks
    WHERE attendance_id = ${attendanceId} AND ended_at IS NOT NULL
  `);
  return res.rows[0]?.total ?? 0;
}
