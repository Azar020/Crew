import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { createSession, type CreatedSession } from '../src/modules/auth/service.js';
import { databaseAvailable, resetTables, seedEmployee, testPool, closeTestPool } from './helpers/db.js';

const available = await databaseAvailable();

describe.skipIf(!available)('Leave Approval Workflow (real PostgreSQL)', () => {
  let app: FastifyInstance;
  let admin: CreatedSession;
  let admin2: CreatedSession;
  let employee: CreatedSession;
  let other: CreatedSession;

  beforeEach(async () => {
    await resetTables();
    app = await buildApp();
    admin = await createSession(await seedEmployee({ email: 'admin@transacty.ai', role: 'admin' }));
    admin2 = await createSession(await seedEmployee({ email: 'admin2@transacty.ai', role: 'admin' }));
    employee = await createSession(await seedEmployee({ email: 'alice@transacty.ai', role: 'employee' }));
    other = await createSession(await seedEmployee({ email: 'bob@transacty.ai', role: 'employee' }));
  });

  afterEach(async () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    await app.close();
  });

  afterAll(closeTestPool);

  function request(
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
    url: string,
    session?: CreatedSession,
    body?: object | string,
    headers?: Record<string, string>,
  ) {
    return app.inject({
      method,
      url,
      ...(session ? { cookies: { teamdesk_session: session.cookieToken } } : {}),
      ...(body !== undefined ? { payload: body } : {}),
      headers: headers ?? (session ? { 'x-csrf-token': session.context.csrfToken } : {}),
    });
  }

  it('1. Employee submits single-day leave request', async () => {
    const res = await request('POST', '/leave-requests', employee, {
      startDate: '2025-06-10',
      endDate: '2025-06-10',
      leaveType: 'sick',
      reason: 'Fever and cold',
    });
    expect(res.statusCode).toBe(201);
    const leave = res.json().leaveRequest;
    expect(leave.employeeId).toBe(employee.context.employeeId);
    expect(leave.startDate).toBe('2025-06-10');
    expect(leave.endDate).toBe('2025-06-10');
    expect(leave.leaveType).toBe('sick');
    expect(leave.reason).toBe('Fever and cold');
    expect(leave.status).toBe('pending');
    expect(leave.rejectionReason).toBeNull();
    expect(leave.reviewedBy).toBeNull();
    expect(leave.reviewedAt).toBeNull();
  });

  it('2. Employee submits multi-day leave request with leave type and reason', async () => {
    const res = await request('POST', '/leave-requests', employee, {
      startDate: '2025-07-01',
      endDate: '2025-07-05',
      leaveType: 'casual',
      reason: 'Family vacation trip',
    });
    expect(res.statusCode).toBe(201);
    const leave = res.json().leaveRequest;
    expect(leave.employeeId).toBe(employee.context.employeeId);
    expect(leave.startDate).toBe('2025-07-01');
    expect(leave.endDate).toBe('2025-07-05');
    expect(leave.leaveType).toBe('casual');
    expect(leave.reason).toBe('Family vacation trip');
    expect(leave.status).toBe('pending');
  });

  it('3. Employee views own leave history and individual request details with status', async () => {
    const c1 = (await request('POST', '/leave-requests', employee, {
      startDate: '2025-05-01',
      endDate: '2025-05-02',
      leaveType: 'casual',
      reason: 'Trip 1',
    })).json().leaveRequest;

    const c2 = (await request('POST', '/leave-requests', employee, {
      startDate: '2025-05-10',
      endDate: '2025-05-11',
      leaveType: 'sick',
      reason: 'Dental appointment',
    })).json().leaveRequest;

    const listRes = await request('GET', '/leave-requests', employee);
    expect(listRes.statusCode).toBe(200);
    const list = listRes.json().leaveRequests;
    expect(list).toHaveLength(2);
    expect(list.map((r: { id: string }) => r.id)).toEqual([c2.id, c1.id]);
    expect(list[0].status).toBe('pending');
    expect(list[0].employee.email).toBe('alice@transacty.ai');

    const detailRes = await request('GET', `/leave-requests/${c1.id}`, employee);
    expect(detailRes.statusCode).toBe(200);
    expect(detailRes.json().leaveRequest.id).toBe(c1.id);
    expect(detailRes.json().leaveRequest.status).toBe('pending');
    expect(detailRes.json().leaveRequest.employee.id).toBe(employee.context.employeeId);
  });

  it("4. Employee cannot view another employee's requests", async () => {
    const created = (await request('POST', '/leave-requests', employee, {
      startDate: '2025-06-01',
      endDate: '2025-06-03',
      leaveType: 'casual',
    })).json().leaveRequest;

    // Direct detail lookup for another employee's request returns 404
    const forbiddenDetail = await request('GET', `/leave-requests/${created.id}`, other);
    expect(forbiddenDetail.statusCode).toBe(404);

    // List scoped to mine does not leak other employee's requests
    const otherList = await request('GET', '/leave-requests', other);
    expect(otherList.statusCode).toBe(200);
    expect(otherList.json().leaveRequests).toHaveLength(0);

    // Employee cannot query scope=all or employeeId filter
    expect((await request('GET', '/leave-requests?scope=all', employee)).statusCode).toBe(403);
    expect((await request('GET', `/leave-requests?employeeId=${employee.context.employeeId}`, employee)).statusCode).toBe(403);
  });

  it('5. Employee cannot approve or reject requests, and admin cannot approve own request', async () => {
    const created = (await request('POST', '/leave-requests', employee, {
      startDate: '2025-06-01',
      endDate: '2025-06-03',
      leaveType: 'casual',
    })).json().leaveRequest;

    // Non-admin employee attempts to approve or reject
    expect((await request('PATCH', `/leave-requests/${created.id}/approve`, employee)).statusCode).toBe(403);
    expect((await request('PATCH', `/leave-requests/${created.id}/reject`, employee, { reason: 'No' })).statusCode).toBe(403);
    expect((await request('PATCH', `/leave-requests/${created.id}/review`, employee, { status: 'approved' })).statusCode).toBe(403);

    // Admin creates their own leave request
    const adminLeave = (await request('POST', '/leave-requests', admin, {
      startDate: '2025-09-01',
      endDate: '2025-09-02',
      leaveType: 'annual',
    })).json().leaveRequest;

    // Admin cannot approve or reject their own leave request (segregation of duties)
    expect((await request('PATCH', `/leave-requests/${adminLeave.id}/approve`, admin)).statusCode).toBe(403);
    expect((await request('PATCH', `/leave-requests/${adminLeave.id}/reject`, admin, { reason: 'No' })).statusCode).toBe(403);

    // Another admin CAN approve it
    const approveOther = await request('PATCH', `/leave-requests/${adminLeave.id}/approve`, admin2);
    expect(approveOther.statusCode).toBe(200);
    expect(approveOther.json().leaveRequest.status).toBe('approved');
  });

  it('6. Admin can view all leave requests and filter by status, employee, and date', async () => {
    const l1 = (await request('POST', '/leave-requests', employee, {
      startDate: '2025-05-01',
      endDate: '2025-05-05',
      leaveType: 'casual',
    })).json().leaveRequest;

    const l2 = (await request('POST', '/leave-requests', other, {
      startDate: '2025-06-01',
      endDate: '2025-06-05',
      leaveType: 'sick',
    })).json().leaveRequest;

    // Approve l1
    await request('PATCH', `/leave-requests/${l1.id}/approve`, admin);

    // Admin views all
    const all = await request('GET', '/leave-requests?scope=all', admin);
    expect(all.statusCode).toBe(200);
    expect(all.json().leaveRequests).toHaveLength(2);

    // Filter by status=pending
    const pendingOnly = await request('GET', '/leave-requests?scope=all&status=pending', admin);
    expect(pendingOnly.statusCode).toBe(200);
    expect(pendingOnly.json().leaveRequests).toHaveLength(1);
    expect(pendingOnly.json().leaveRequests[0].id).toBe(l2.id);

    // Filter by status=approved
    const approvedOnly = await request('GET', '/leave-requests?scope=all&status=approved', admin);
    expect(approvedOnly.statusCode).toBe(200);
    expect(approvedOnly.json().leaveRequests).toHaveLength(1);
    expect(approvedOnly.json().leaveRequests[0].id).toBe(l1.id);

    // Filter by employeeId
    const employeeOnly = await request('GET', `/leave-requests?scope=all&employeeId=${employee.context.employeeId}`, admin);
    expect(employeeOnly.statusCode).toBe(200);
    expect(employeeOnly.json().leaveRequests).toHaveLength(1);
    expect(employeeOnly.json().leaveRequests[0].id).toBe(l1.id);

    // Filter by date range
    const dateFilter = await request('GET', '/leave-requests?scope=all&fromDate=2025-05-20&toDate=2025-06-30', admin);
    expect(dateFilter.statusCode).toBe(200);
    expect(dateFilter.json().leaveRequests).toHaveLength(1);
    expect(dateFilter.json().leaveRequests[0].id).toBe(l2.id);

    // Admin views individual request with employee details
    const detail = await request('GET', `/leave-requests/${l1.id}`, admin);
    expect(detail.statusCode).toBe(200);
    expect(detail.json().leaveRequest.employee.email).toBe('alice@transacty.ai');
    expect(detail.json().leaveRequest.status).toBe('approved');
  });

  it('7. Admin can approve a pending request and write audit trail', async () => {
    const created = (await request('POST', '/leave-requests', employee, {
      startDate: '2025-07-10',
      endDate: '2025-07-12',
      leaveType: 'casual',
      reason: 'Conference',
    })).json().leaveRequest;

    const res = await request('PATCH', `/leave-requests/${created.id}/approve`, admin);
    expect(res.statusCode).toBe(200);
    const updated = res.json().leaveRequest;
    expect(updated.status).toBe('approved');
    expect(updated.reviewedBy).toBe(admin.context.employeeId);
    expect(updated.reviewedAt).toBeDefined();
    expect(updated.rejectionReason).toBeNull();
    expect(updated.employee.name).toBe('alice');

    // Audit event verification in PostgreSQL
    const auditRes = await testPool().query(
      'SELECT * FROM leave_audit_events WHERE leave_request_id = $1',
      [created.id],
    );
    expect(auditRes.rows).toHaveLength(1);
    expect(auditRes.rows[0].action).toBe('leave.approve');
    expect(auditRes.rows[0].actor_id).toBe(admin.context.employeeId);
    expect(auditRes.rows[0].before.status).toBe('pending');
    expect(auditRes.rows[0].after.status).toBe('approved');
  });

  it('8. Admin can reject a pending request with a mandatory reason', async () => {
    const created = (await request('POST', '/leave-requests', employee, {
      startDate: '2025-07-15',
      endDate: '2025-07-16',
      leaveType: 'sick',
    })).json().leaveRequest;

    const res = await request('PATCH', `/leave-requests/${created.id}/reject`, admin, {
      reason: 'Critical product release week',
    });
    expect(res.statusCode).toBe(200);
    const updated = res.json().leaveRequest;
    expect(updated.status).toBe('rejected');
    expect(updated.rejectionReason).toBe('Critical product release week');
    expect(updated.reviewedBy).toBe(admin.context.employeeId);
    expect(updated.reviewedAt).toBeDefined();

    // Audit event verification in PostgreSQL
    const auditRes = await testPool().query(
      'SELECT * FROM leave_audit_events WHERE leave_request_id = $1',
      [created.id],
    );
    expect(auditRes.rows).toHaveLength(1);
    expect(auditRes.rows[0].action).toBe('leave.reject');
    expect(auditRes.rows[0].actor_id).toBe(admin.context.employeeId);
    expect(auditRes.rows[0].after.rejectionReason).toBe('Critical product release week');
  });

  it('9. Rejection without a reason is rejected with 400', async () => {
    const created = (await request('POST', '/leave-requests', employee, {
      startDate: '2025-07-20',
      endDate: '2025-07-21',
      leaveType: 'casual',
    })).json().leaveRequest;

    for (const emptyBody of [{}, { reason: '' }, { reason: '   ' }, { rejectionReason: '' }]) {
      const res = await request('PATCH', `/leave-requests/${created.id}/reject`, admin, emptyBody);
      expect(res.statusCode).toBe(400);
    }

    // Verify request status remained pending
    const check = await request('GET', `/leave-requests/${created.id}`, admin);
    expect(check.json().leaveRequest.status).toBe('pending');
  });

  it('10. Employee cannot modify approval status directly or modify approved/rejected requests', async () => {
    const created = (await request('POST', '/leave-requests', employee, {
      startDate: '2025-08-01',
      endDate: '2025-08-03',
      leaveType: 'casual',
      reason: 'Summer break',
    })).json().leaveRequest;

    // Direct status modification via patch is blocked (strict Zod schema)
    const hack = await request('PATCH', `/leave-requests/${created.id}`, employee, {
      status: 'approved',
    });
    expect(hack.statusCode).toBe(400);

    // Admin approves the request
    await request('PATCH', `/leave-requests/${created.id}/approve`, admin);

    // Employee attempts to edit approved request -> 409 Conflict
    const editApproved = await request('PATCH', `/leave-requests/${created.id}`, employee, {
      reason: 'Change my plans',
    });
    expect(editApproved.statusCode).toBe(409);

    // Create another request and reject it
    const created2 = (await request('POST', '/leave-requests', employee, {
      startDate: '2025-08-10',
      endDate: '2025-08-12',
      leaveType: 'casual',
    })).json().leaveRequest;

    await request('PATCH', `/leave-requests/${created2.id}/reject`, admin, { reason: 'Staffing shortage' });

    // Employee attempts to edit rejected request -> 409 Conflict
    const editRejected = await request('PATCH', `/leave-requests/${created2.id}`, employee, {
      startDate: '2025-08-11',
    });
    expect(editRejected.statusCode).toBe(409);
  });

  it('11. Overlapping leave requests are prevented across all inclusive intersection shapes', async () => {
    const base = { startDate: '2025-09-10', endDate: '2025-09-20', leaveType: 'annual' };
    const res = await request('POST', '/leave-requests', employee, base);
    expect(res.statusCode).toBe(201);

    // Overlapping shapes are rejected
    for (const [startDate, endDate] of [
      ['2025-09-10', '2025-09-20'],
      ['2025-09-12', '2025-09-15'],
      ['2025-09-01', '2025-09-30'],
      ['2025-09-05', '2025-09-10'],
      ['2025-09-20', '2025-09-25'],
    ]) {
      const overlap = await request('POST', '/leave-requests', employee, { startDate, endDate, leaveType: 'annual' });
      expect(overlap.statusCode).toBe(409);
    }

    // Adjacent dates succeed
    expect((await request('POST', '/leave-requests', employee, {
      startDate: '2025-09-01',
      endDate: '2025-09-09',
      leaveType: 'annual',
    })).statusCode).toBe(201);

    expect((await request('POST', '/leave-requests', employee, {
      startDate: '2025-09-21',
      endDate: '2025-09-25',
      leaveType: 'annual',
    })).statusCode).toBe(201);

    // Different employee can request the same dates
    expect((await request('POST', '/leave-requests', other, base)).statusCode).toBe(201);
  });

  it('12. Invalid date ranges and calendar dates are rejected', async () => {
    // End date earlier than start date
    const inverted = await request('POST', '/leave-requests', employee, {
      startDate: '2025-07-20',
      endDate: '2025-07-10',
      leaveType: 'casual',
    });
    expect(inverted.statusCode).toBe(400);

    // Non-existent calendar date
    const leapError = await request('POST', '/leave-requests', employee, {
      startDate: '2025-02-29',
      endDate: '2025-02-29',
      leaveType: 'sick',
    });
    expect(leapError.statusCode).toBe(400);
  });

  it('13. Already approved requests cannot be approved or rejected again', async () => {
    const created = (await request('POST', '/leave-requests', employee, {
      startDate: '2025-10-01',
      endDate: '2025-10-03',
      leaveType: 'casual',
    })).json().leaveRequest;

    // First approval succeeds
    expect((await request('PATCH', `/leave-requests/${created.id}/approve`, admin)).statusCode).toBe(200);

    // Subsequent approval attempt returns 409 Conflict
    const reApprove = await request('PATCH', `/leave-requests/${created.id}/approve`, admin);
    expect(reApprove.statusCode).toBe(409);

    // Rejection of already approved request returns 409 Conflict
    const rejectApproved = await request('PATCH', `/leave-requests/${created.id}/reject`, admin, {
      reason: 'Changed mind',
    });
    expect(rejectApproved.statusCode).toBe(409);
  });

  it('14. Already rejected requests cannot be processed again', async () => {
    const created = (await request('POST', '/leave-requests', employee, {
      startDate: '2025-11-01',
      endDate: '2025-11-03',
      leaveType: 'casual',
    })).json().leaveRequest;

    // First rejection succeeds
    expect((await request('PATCH', `/leave-requests/${created.id}/reject`, admin, { reason: 'No' })).statusCode).toBe(200);

    // Subsequent rejection attempt returns 409 Conflict
    const reReject = await request('PATCH', `/leave-requests/${created.id}/reject`, admin, { reason: 'No again' });
    expect(reReject.statusCode).toBe(409);

    // Approval of already rejected request returns 409 Conflict
    const approveRejected = await request('PATCH', `/leave-requests/${created.id}/approve`, admin);
    expect(approveRejected.statusCode).toBe(409);
  });

  it('15. Concurrent approval/rejection attempts are serialized safely by row lock', async () => {
    const created = (await request('POST', '/leave-requests', employee, {
      startDate: '2025-12-01',
      endDate: '2025-12-05',
      leaveType: 'annual',
    })).json().leaveRequest;

    // Dispatch two review attempts concurrently (admin approves, admin2 rejects)
    const [res1, res2] = await Promise.all([
      request('PATCH', `/leave-requests/${created.id}/approve`, admin),
      request('PATCH', `/leave-requests/${created.id}/reject`, admin2, { reason: 'Conflict' }),
    ]);

    const statuses = [res1.statusCode, res2.statusCode].sort();
    // Exactly one must succeed with 200, and the other must be rejected with 409 Conflict
    expect(statuses).toEqual([200, 409]);

    // Exactly one audit row should exist
    const audits = await testPool().query(
      'SELECT action FROM leave_audit_events WHERE leave_request_id = $1',
      [created.id],
    );
    expect(audits.rows).toHaveLength(1);
  });
});
