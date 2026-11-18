import { sql, type SQL } from 'drizzle-orm';
import { leaveAuditEvents } from '../../db/schema/index.js';
import type { AuthContext } from '../auth/service.js';
import { AppError } from '../../shared/errors.js';
import { listOwner, withRecordAccess } from '../../shared/record-access.js';
import type {
  CreateLeaveRequest,
  LeaveListQuery,
  PatchLeaveRequest,
} from './schemas.js';

type LeaveRow = {
  id: string;
  employeeId: string;
  startDate: string;
  endDate: string;
  reason: string | null;
  status: 'pending' | 'approved' | 'rejected';
  leaveType: string;
  rejectionReason: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
  empId?: string;
  employeeName?: string;
  employeeEmail?: string;
};

const columns = sql`id, employee_id AS "employeeId", start_date AS "startDate",
  end_date AS "endDate", reason, status, leave_type AS "leaveType",
  rejection_reason AS "rejectionReason", reviewed_by AS "reviewedBy",
  reviewed_at AS "reviewedAt", created_at AS "createdAt", updated_at AS "updatedAt"`;

const response = (row: LeaveRow, options?: { includeWorkflow?: boolean }) => {
  const includeWorkflow = options?.includeWorkflow ?? true;
  return {
    id: row.id,
    employeeId: row.employeeId,
    startDate: row.startDate,
    endDate: row.endDate,
    reason: row.reason,
    ...(includeWorkflow ? {
      status: row.status,
      leaveType: row.leaveType,
      rejectionReason: row.rejectionReason ?? null,
      reviewedBy: row.reviewedBy ?? null,
      reviewedAt: row.reviewedAt ? new Date(row.reviewedAt).toISOString() : null,
    } : {}),
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
    ...(row.empId ? {
      employee: {
        id: row.empId,
        name: row.employeeName!,
        email: row.employeeEmail!,
      },
    } : {}),
  };
};

export async function createLeaveRequest(auth: AuthContext, input: CreateLeaveRequest) {
  return withRecordAccess(auth, async (tx) => {
    // Inclusive intersection. The employee FOR UPDATE lock is held from BEFORE
    // this SELECT through COMMIT, so simultaneous submissions cannot both pass.
    // Rejected requests do not block future applications on the same dates.
    const overlap = await tx.execute(sql`
      SELECT id FROM leave_requests WHERE employee_id = ${auth.employeeId}
        AND status <> 'rejected'
        AND start_date <= ${input.endDate}::date AND end_date >= ${input.startDate}::date LIMIT 1
    `);
    if (overlap.rows[0]) throw new AppError('Leave request overlaps an existing request', 409);
    const leaveType = input.leaveType ?? 'casual';
    const result = await tx.execute<LeaveRow>(sql`
      INSERT INTO leave_requests (employee_id, start_date, end_date, reason, leave_type)
      VALUES (${auth.employeeId}, ${input.startDate}, ${input.endDate}, ${input.reason ?? null}, ${leaveType})
      RETURNING ${columns}
    `);
    return response(result.rows[0]!, { includeWorkflow: input.leaveType !== undefined });
  }, {
    exclusiveEmployee: true, conflicts: [{
      code: '23505',
      constraint: 'leave_requests_employee_dates_unique_idx', message: 'Leave request overlaps an existing request'
    }]
  });
}

/** Owner-scoped partial edit. Admin access to the list surface does NOT confer
 * edit rights: the record is only reachable through its session owner. The
 * patch is merged with the locked row, the FINAL record is validated, and the
 * exclusive employee lock (same as create) serializes overlap decisions against
 * concurrent submissions. Fields are written explicitly; bodies are never spread.
 * Approved or rejected requests cannot be modified.
 */
export async function patchLeaveRequest(auth: AuthContext, id: string, patch: PatchLeaveRequest) {
  return withRecordAccess(auth, async (tx) => {
    const current = (await tx.execute<LeaveRow>(sql`
      SELECT ${columns} FROM leave_requests WHERE id = ${id} AND employee_id = ${auth.employeeId} FOR UPDATE
    `)).rows[0];
    if (!current) throw new AppError('Leave request not found', 404);
    if (current.status !== 'pending') {
      throw new AppError('Cannot modify a leave request that has already been approved or rejected', 409);
    }
    const merged = {
      startDate: patch.startDate ?? current.startDate,
      endDate: patch.endDate ?? current.endDate,
      reason: patch.reason ?? current.reason,
      leaveType: patch.leaveType ?? current.leaveType,
    };
    if (merged.endDate < merged.startDate) throw new AppError('endDate must not precede startDate', 400);
    // A no-op patch leaves the record (and its timestamps) untouched.
    if (merged.startDate === current.startDate && merged.endDate === current.endDate
      && merged.reason === current.reason && merged.leaveType === current.leaveType) return response(current);
    const overlap = await tx.execute(sql`
      SELECT id FROM leave_requests WHERE employee_id = ${auth.employeeId} AND id <> ${id}
        AND status <> 'rejected'
        AND start_date <= ${merged.endDate}::date AND end_date >= ${merged.startDate}::date LIMIT 1
    `);
    if (overlap.rows[0]) throw new AppError('Leave request overlaps an existing request', 409);
    const result = await tx.execute<LeaveRow>(sql`
      UPDATE leave_requests SET start_date = ${merged.startDate}, end_date = ${merged.endDate},
        reason = ${merged.reason}, leave_type = ${merged.leaveType}, updated_at = now()
      WHERE id = ${id} RETURNING ${columns}
    `);
    return response(result.rows[0]!);
  }, {
    exclusiveEmployee: true, conflicts: [{
      code: '23505',
      constraint: 'leave_requests_employee_dates_unique_idx', message: 'Leave request overlaps an existing request'
    }]
  });
}

export async function getLeaveRequest(auth: AuthContext, id: string) {
  return withRecordAccess(auth, async (tx, role) => {
    const condition = role === 'admin'
      ? sql`lr.id = ${id}`
      : sql`lr.id = ${id} AND lr.employee_id = ${auth.employeeId}`;
    const rows = await tx.execute<LeaveRow>(sql`
      SELECT lr.id, lr.employee_id AS "employeeId", lr.start_date AS "startDate",
        lr.end_date AS "endDate", lr.reason, lr.status, lr.leave_type AS "leaveType",
        lr.rejection_reason AS "rejectionReason", lr.reviewed_by AS "reviewedBy",
        lr.reviewed_at AS "reviewedAt", lr.created_at AS "createdAt", lr.updated_at AS "updatedAt",
        emp.id AS "empId", emp.name AS "employeeName", emp.email AS "employeeEmail"
      FROM leave_requests lr
      JOIN employees emp ON lr.employee_id = emp.id
      WHERE ${condition}
    `);
    const row = rows.rows[0];
    if (!row) throw new AppError('Leave request not found', 404);
    return response(row);
  });
}

export async function listLeaveRequests(auth: AuthContext, query: LeaveListQuery) {
  return withRecordAccess(auth, async (tx, role) => {
    const owner = listOwner(auth, role, query);
    const conditions: SQL[] = [sql`true`];
    if (owner !== undefined) conditions.push(sql`lr.employee_id = ${owner}`);
    if (query.fromDate !== undefined) conditions.push(sql`lr.end_date >= ${query.fromDate}::date`);
    if (query.toDate !== undefined) conditions.push(sql`lr.start_date <= ${query.toDate}::date`);
    if (query.status !== undefined) conditions.push(sql`lr.status = ${query.status}`);
    const rows = await tx.execute<LeaveRow>(sql`
      SELECT lr.id, lr.employee_id AS "employeeId", lr.start_date AS "startDate",
        lr.end_date AS "endDate", lr.reason, lr.status, lr.leave_type AS "leaveType",
        lr.rejection_reason AS "rejectionReason", lr.reviewed_by AS "reviewedBy",
        lr.reviewed_at AS "reviewedAt", lr.created_at AS "createdAt", lr.updated_at AS "updatedAt",
        emp.id AS "empId", emp.name AS "employeeName", emp.email AS "employeeEmail"
      FROM leave_requests lr
      JOIN employees emp ON lr.employee_id = emp.id
      WHERE ${sql.join(conditions, sql` AND `)}
      ORDER BY lr.created_at DESC, lr.id DESC LIMIT ${query.limit} OFFSET ${query.offset}
    `);
    return { leaveRequests: rows.rows.map((r) => response(r)), limit: query.limit, offset: query.offset };
  });
}

/** Admin review of pending leave requests. Enforces row-level locking for concurrency safety,
 * prevents employees from approving/rejecting their own requests, forbids re-reviewing already
 * resolved requests, and records audit trail atomically.
 */
export async function reviewLeaveRequest(
  auth: AuthContext,
  id: string,
  input: { status: 'approved' | 'rejected'; rejectionReason?: string | undefined },
) {
  return withRecordAccess(auth, async (tx) => {
    const target = (await tx.execute<{
      id: string;
      employeeId: string;
      status: 'pending' | 'approved' | 'rejected';
      empId: string;
      employeeName: string;
      employeeEmail: string;
    }>(sql`
      SELECT lr.id, lr.employee_id AS "employeeId", lr.status,
        emp.id AS "empId", emp.name AS "employeeName", emp.email AS "employeeEmail"
      FROM leave_requests lr
      JOIN employees emp ON lr.employee_id = emp.id
      WHERE lr.id = ${id}
      FOR UPDATE OF lr
    `)).rows[0];

    if (!target) throw new AppError('Leave request not found', 404);

    if (target.employeeId === auth.employeeId) {
      throw new AppError('Cannot approve or reject your own leave request', 403);
    }

    if (target.status !== 'pending') {
      throw new AppError('Leave request has already been reviewed', 409);
    }

    if (input.status === 'rejected') {
      if (!input.rejectionReason || input.rejectionReason.trim().length === 0) {
        throw new AppError('Rejection reason is required', 400);
      }
    }

    const cleanRejectionReason = input.status === 'rejected' ? input.rejectionReason!.trim() : null;

    const updated = (await tx.execute<LeaveRow>(sql`
      UPDATE leave_requests
      SET status = ${input.status},
          reviewed_by = ${auth.employeeId},
          reviewed_at = clock_timestamp(),
          rejection_reason = ${cleanRejectionReason},
          updated_at = clock_timestamp()
      WHERE id = ${id}
      RETURNING ${columns}
    `)).rows[0]!;

    const changedFields = input.status === 'approved'
      ? ['status', 'reviewed_by', 'reviewed_at']
      : ['status', 'reviewed_by', 'reviewed_at', 'rejection_reason'];

    await tx.insert(leaveAuditEvents).values({
      actorId: auth.employeeId,
      leaveRequestId: id,
      action: input.status === 'approved' ? 'leave.approve' : 'leave.reject',
      changedFields,
      before: { status: target.status },
      after: { status: input.status, rejectionReason: cleanRejectionReason },
    });

    return response({
      ...updated,
      empId: target.empId,
      employeeName: target.employeeName,
      employeeEmail: target.employeeEmail,
    });
  }, { admin: true });
}
