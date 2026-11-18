import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { createSession, type CreatedSession } from '../src/modules/auth/service.js';
import { databaseAvailable, resetTables, seedEmployee, testPool, closeTestPool } from './helpers/db.js';

const available = await databaseAvailable();
const IN = 'Asia/Kolkata';
const missingId = '11111111-1111-4111-8111-111111111111';

describe.skipIf(!available)('Attendance Breaks API (real PostgreSQL)', () => {
  let app: FastifyInstance;
  let admin: CreatedSession;
  let employee: CreatedSession;
  let other: CreatedSession;
  let employeeId: string;
  let otherId: string;

  beforeEach(async () => {
    await resetTables();
    app = await buildApp();
    admin = await createSession(await seedEmployee({ email: 'admin@transacty.ai', role: 'admin', timezone: IN }));
    employeeId = await seedEmployee({ email: 'alice@transacty.ai', name: 'Alice', timezone: IN });
    otherId = await seedEmployee({ email: 'bob@transacty.ai', name: 'Bob', timezone: IN });
    employee = await createSession(employeeId);
    other = await createSession(otherId);
  });

  afterEach(async () => {
    await app.close();
  });

  afterAll(closeTestPool);

  function request(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
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

  async function checkInEmployee(session: CreatedSession): Promise<string> {
    const res = await request('POST', '/attendance/check-in', session);
    expect(res.statusCode).toBe(201);
    return res.json().attendance.id;
  }

  it('1. Successful break start via /api/attendance/:attendanceId/breaks/start and /attendance/:attendanceId/breaks/start', async () => {
    const attendanceId = await checkInEmployee(employee);

    // Start break via /api route
    const res = await request('POST', `/api/attendance/${attendanceId}/breaks/start`, employee);
    expect(res.statusCode).toBe(201);
    const breakData = res.json().break;
    expect(breakData.id).toBeDefined();
    expect(breakData.attendanceId).toBe(attendanceId);
    expect(breakData.employeeId).toBe(employeeId);
    expect(breakData.startedAt).toBeDefined();
    expect(breakData.endedAt).toBeNull();
    expect(breakData.durationSeconds).toBeNull();

    // Verify row persisted in database
    const dbRow = (await testPool().query('SELECT * FROM attendance_breaks WHERE id = $1', [breakData.id])).rows[0];
    expect(dbRow).toBeDefined();
    expect(dbRow.employee_id).toBe(employeeId);
    expect(dbRow.attendance_id).toBe(attendanceId);
    expect(dbRow.ended_at).toBeNull();
  });

  it('2. Successful break end and duration calculation', async () => {
    const attendanceId = await checkInEmployee(employee);

    // Start break
    const startRes = await request('POST', `/attendance/${attendanceId}/breaks/start`, employee);
    expect(startRes.statusCode).toBe(201);
    const breakId = startRes.json().break.id;

    // End break via /api route
    const endRes = await request('POST', `/api/attendance/${attendanceId}/breaks/${breakId}/end`, employee);
    expect(endRes.statusCode).toBe(200);
    const endedBreak = endRes.json().break;
    expect(endedBreak.id).toBe(breakId);
    expect(endedBreak.endedAt).not.toBeNull();
    expect(typeof endRes.json().durationSeconds).toBe('number');
    expect(endRes.json().durationSeconds).toBeGreaterThanOrEqual(0);
    expect(endedBreak.durationSeconds).toBe(endRes.json().durationSeconds);

    // Verify row in DB has ended_at
    const dbRow = (await testPool().query('SELECT * FROM attendance_breaks WHERE id = $1', [breakId])).rows[0];
    expect(dbRow.ended_at).not.toBeNull();
  });

  it('3. Multiple sequential breaks within one attendance session', async () => {
    const attendanceId = await checkInEmployee(employee);

    // Break 1
    const b1Start = await request('POST', `/api/attendance/${attendanceId}/breaks/start`, employee);
    expect(b1Start.statusCode).toBe(201);
    const b1Id = b1Start.json().break.id;
    const b1End = await request('POST', `/api/attendance/${attendanceId}/breaks/${b1Id}/end`, employee);
    expect(b1End.statusCode).toBe(200);

    // Break 2
    const b2Start = await request('POST', `/attendance/${attendanceId}/breaks/start`, employee);
    expect(b2Start.statusCode).toBe(201);
    const b2Id = b2Start.json().break.id;
    const b2End = await request('POST', `/attendance/${attendanceId}/breaks/${b2Id}/end`, employee);
    expect(b2End.statusCode).toBe(200);

    // List breaks
    const listRes = await request('GET', `/api/attendance/${attendanceId}/breaks`, employee);
    expect(listRes.statusCode).toBe(200);
    const data = listRes.json();
    expect(data.breaks).toHaveLength(2);
    expect(data.activeBreak).toBeNull();
    expect(data.totalBreakDurationSeconds).toBeGreaterThanOrEqual(0);
    expect(data.totalBreakDurationSeconds).toBe(b1End.json().durationSeconds + b2End.json().durationSeconds);
  });

  it('4. Duplicate active break prevention (concurrent active break blocked with 409)', async () => {
    const attendanceId = await checkInEmployee(employee);

    // Start first break
    const b1 = await request('POST', `/api/attendance/${attendanceId}/breaks/start`, employee);
    expect(b1.statusCode).toBe(201);

    // Try starting a second break while first is still active
    const b2 = await request('POST', `/api/attendance/${attendanceId}/breaks/start`, employee);
    expect(b2.statusCode).toBe(409);
    expect(b2.json().message).toMatch(/active break/i);
  });

  it('5. Break start without attendance record returns 404', async () => {
    const res = await request('POST', `/api/attendance/${missingId}/breaks/start`, employee);
    expect(res.statusCode).toBe(404);
    expect(res.json().message).toMatch(/attendance record not found/i);
  });

  it('6. Break start after checkout returns 409', async () => {
    const attendanceId = await checkInEmployee(employee);

    // Checkout
    const checkOutRes = await request('POST', '/attendance/check-out', employee);
    expect(checkOutRes.statusCode).toBe(200);

    // Attempt starting break on closed attendance
    const res = await request('POST', `/api/attendance/${attendanceId}/breaks/start`, employee);
    expect(res.statusCode).toBe(409);
    expect(res.json().message).toMatch(/closed attendance/i);
  });

  it('7. Ending a nonexistent break returns 404', async () => {
    const attendanceId = await checkInEmployee(employee);

    const res = await request('POST', `/api/attendance/${attendanceId}/breaks/${missingId}/end`, employee);
    expect(res.statusCode).toBe(404);
    expect(res.json().message).toMatch(/break record not found/i);
  });

  it('8. Ending an already completed break returns 409', async () => {
    const attendanceId = await checkInEmployee(employee);

    const startRes = await request('POST', `/api/attendance/${attendanceId}/breaks/start`, employee);
    const breakId = startRes.json().break.id;

    // End break first time
    const end1 = await request('POST', `/api/attendance/${attendanceId}/breaks/${breakId}/end`, employee);
    expect(end1.statusCode).toBe(200);

    // End break second time -> 409
    const end2 = await request('POST', `/api/attendance/${attendanceId}/breaks/${breakId}/end`, employee);
    expect(end2.statusCode).toBe(409);
    expect(end2.json().message).toMatch(/already ended/i);
  });

  it('9. Accessing another employee attendance breaks is blocked (403)', async () => {
    const aliceAttendanceId = await checkInEmployee(employee);

    // Bob tries to start break on Alice's attendance -> 403
    const startRes = await request('POST', `/api/attendance/${aliceAttendanceId}/breaks/start`, other);
    expect(startRes.statusCode).toBe(403);

    // Alice starts a break
    const aliceBreak = (await request('POST', `/api/attendance/${aliceAttendanceId}/breaks/start`, employee)).json().break;

    // Bob tries to end Alice's break -> 403
    const endRes = await request('POST', `/api/attendance/${aliceAttendanceId}/breaks/${aliceBreak.id}/end`, other);
    expect(endRes.statusCode).toBe(403);

    // Bob tries to view Alice's breaks -> 403
    const listRes = await request('GET', `/api/attendance/${aliceAttendanceId}/breaks`, other);
    expect(listRes.statusCode).toBe(403);
  });

  it('10. Admin access to employee break records', async () => {
    const aliceAttendanceId = await checkInEmployee(employee);

    // Alice takes a break
    const b = (await request('POST', `/api/attendance/${aliceAttendanceId}/breaks/start`, employee)).json().break;
    await request('POST', `/api/attendance/${aliceAttendanceId}/breaks/${b.id}/end`, employee);

    // Admin views Alice's breaks -> 200 OK
    const adminView = await request('GET', `/api/attendance/${aliceAttendanceId}/breaks`, admin);
    expect(adminView.statusCode).toBe(200);
    const data = adminView.json();
    expect(data.breaks).toHaveLength(1);
    expect(data.breaks[0].id).toBe(b.id);
    expect(data.breaks[0].employeeId).toBe(employeeId);
    expect(data.totalBreakDurationSeconds).toBeGreaterThanOrEqual(0);
  });

  it('11. Correct duration calculation from timestamps', async () => {
    const attendanceId = await checkInEmployee(employee);

    // Directly insert a break with known start time 10 minutes ago
    const startedAt = new Date(Date.now() - 600_000).toISOString();
    const insertRes = await testPool().query(
      `INSERT INTO attendance_breaks (attendance_id, employee_id, started_at)
       VALUES ($1, $2, $3) RETURNING id`,
      [attendanceId, employeeId, startedAt],
    );
    const breakId = insertRes.rows[0].id;

    // End break
    const endRes = await request('POST', `/api/attendance/${attendanceId}/breaks/${breakId}/end`, employee);
    expect(endRes.statusCode).toBe(200);
    const duration = endRes.json().durationSeconds;
    // Expected around 600 seconds (allowing +/- 5 seconds for execution delay)
    expect(duration).toBeGreaterThanOrEqual(595);
    expect(duration).toBeLessThanOrEqual(610);

    // Check GET returns matching total
    const getRes = await request('GET', `/api/attendance/${attendanceId}/breaks`, employee);
    expect(getRes.statusCode).toBe(200);
    expect(getRes.json().totalBreakDurationSeconds).toBe(duration);
  });

  it('12. Unauthenticated access and missing CSRF are denied', async () => {
    const attendanceId = await checkInEmployee(employee);

    // Unauthenticated
    expect((await request('GET', `/api/attendance/${attendanceId}/breaks`)).statusCode).toBe(401);
    expect((await request('POST', `/api/attendance/${attendanceId}/breaks/start`)).statusCode).toBe(401);

    // Missing CSRF
    expect((await request('POST', `/api/attendance/${attendanceId}/breaks/start`, employee, undefined, {})).statusCode).toBe(403);
  });
});
