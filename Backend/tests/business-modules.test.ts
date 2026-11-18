import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { createSession, type CreatedSession } from '../src/modules/auth/service.js';
import { createLeaveRequest } from '../src/modules/leave/service.js';
import { createDailyUpdate } from '../src/modules/daily-updates/service.js';
import { createHoliday } from '../src/modules/holidays/service.js';
import { companyDate } from '../src/shared/calendar.js';
import { databaseAvailable, resetTables, seedEmployee, testPool, closeTestPool } from './helpers/db.js';
import { waitForBlockedQuery } from './helpers/locks.js';

const available = await databaseAvailable();
const missingId = '11111111-1111-4111-8111-111111111111';
const leaveBody = { startDate: '2024-02-28', endDate: '2024-03-02', reason: ' Private reason ' };
const dailyBody = { workDate: '2024-02-29', content: ' Completed work ' };
const holidayBody = { name: ' Holiday ', date: '2024-02-29' };
const recordModules = [
  { path: '/leave-requests', key: 'leaveRequests', singular: 'leaveRequest', body: leaveBody },
  { path: '/daily-updates', key: 'dailyUpdates', singular: 'dailyUpdate', body: dailyBody },
] as const;

describe.skipIf(!available)('leave, updates, holidays (real PostgreSQL)', () => {
  let app: FastifyInstance;
  let admin: CreatedSession;
  let employee: CreatedSession;
  let other: CreatedSession;

  beforeEach(async () => {
    await resetTables();
    app = await buildApp();
    admin = await createSession(await seedEmployee({ email: 'admin@transacty.ai', role: 'admin' }));
    employee = await createSession(await seedEmployee({ email: 'alice@transacty.ai', googleSub: 'private-sub' }));
    other = await createSession(await seedEmployee({ email: 'bob@n23digitals.com' }));
  });
  afterEach(async () => { vi.useRealTimers(); vi.restoreAllMocks(); await app.close(); });
  afterAll(closeTestPool);

  function request(method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, session?: CreatedSession,
    body?: object | string, headers?: Record<string, string>) {
    return app.inject({ method, url,
      ...(session ? { cookies: { teamdesk_session: session.cookieToken } } : {}),
      ...(body !== undefined ? { payload: body } : {}),
      headers: headers ?? (session ? { 'x-csrf-token': session.context.csrfToken } : {}),
    });
  }

  it.each(['missing', 'invalid', 'expired', 'inactive', 'revoked'])('denies %s authentication on every endpoint', async (state) => {
    if (state === 'expired') await testPool().query("UPDATE sessions SET absolute_expires_at = now() - interval '1 second'");
    if (state === 'inactive') await testPool().query('UPDATE employees SET is_active = false');
    if (state === 'revoked') await testPool().query('UPDATE sessions SET revoked_at = now()');
    const session = state === 'missing' ? undefined : state === 'invalid' ? { ...admin, cookieToken: 'invalid' } : admin;
    for (const [method, url, body] of [
      ['POST', '/leave-requests', leaveBody], ['GET', '/leave-requests', undefined],
      ['PATCH', `/leave-requests/${missingId}`, { reason: 'Later' }],
      ['POST', '/daily-updates', dailyBody], ['GET', '/daily-updates', undefined],
      ['PATCH', `/daily-updates/${missingId}`, { content: 'Later' }],
      ['POST', '/holidays', holidayBody], ['GET', '/holidays', undefined],
      ['PATCH', `/holidays/${missingId}`, { name: 'Later' }], ['DELETE', `/holidays/${missingId}`, undefined],
    ] as const) {
      const response = await request(method, url, session, body);
      expect(response.statusCode, `${method} ${url}`).toBe(401);
      expect(response.headers['cache-control']).toBe('no-store');
    }
  });

  it.each(recordModules)('scopes $path to the session owner with explicit admin scope/filter semantics', async ({ path, key, singular, body }) => {
    for (const session of [admin, employee, other]) {
      const created = await request('POST', path, session, body);
      expect(created.statusCode).toBe(201);
      expect(created.json()[singular].employeeId).toBe(session.context.employeeId);
    }
    for (const session of [admin, employee, other]) {
      const response = await request('GET', path, session, undefined, {});
      expect(response.statusCode).toBe(200);
      expect(response.json()[key].map((item: { employeeId: string }) => item.employeeId)).toEqual([session.context.employeeId]);
      expect(response.headers['cache-control']).toBe('no-store');
    }
    expect((await request('GET', `${path}?scope=mine`, admin)).json()[key]).toHaveLength(1);
    expect((await request('GET', `${path}?scope=all`, admin)).json()[key]).toHaveLength(3);
    const filtered = await request('GET', `${path}?scope=all&employeeId=${other.context.employeeId}`, admin);
    expect(filtered.json()[key].map((item: { employeeId: string }) => item.employeeId)).toEqual([other.context.employeeId]);
    expect((await request('GET', `${path}?scope=all&employeeId=${missingId}`, admin)).json()[key]).toEqual([]);
    for (const query of ['scope=all', `scope=all&employeeId=${other.context.employeeId}`,
      `employeeId=${employee.context.employeeId}`, `scope=mine&employeeId=${other.context.employeeId}`]) {
      expect((await request('GET', `${path}?${query}`, employee)).statusCode).toBe(403);
    }
    expect((await request('GET', `${path}?employeeId=${other.context.employeeId}`, admin)).statusCode).toBe(403);
  });

  it('blocks every employee holiday mutation', async () => {
    const holiday = (await request('POST', '/holidays', admin, holidayBody)).json().holiday;
    for (const [method, url, body] of [
      ['POST', '/holidays', holidayBody], ['PATCH', `/holidays/${holiday.id}`, holidayBody],
      ['DELETE', `/holidays/${holiday.id}`, undefined],
    ] as const) expect((await request(method, url, employee, body)).statusCode).toBe(403);
    expect((await request('GET', '/holidays?year=2024', employee, undefined, {})).json().holidays).toHaveLength(1);
  });

  it.each(recordModules)('rejects ownership/security/unknown fields on $path without partial writes', async ({ path, body, key }) => {
    for (const extra of [{ employeeId: other.context.employeeId }, { createdBy: admin.context.employeeId },
      { role: 'admin' }, { status: 'approved' }, { createdAt: new Date().toISOString() }, { updatedAt: new Date().toISOString() },
      { id: missingId }, { unknown: true }]) {
      expect((await request('POST', path, employee, { ...body, ...extra })).statusCode).toBe(400);
      expect((await request('PATCH', `${path}/${missingId}`, employee, { ...body, ...extra })).statusCode).toBe(400);
      expect((await request('PATCH', `${path}/${missingId}`, employee, extra)).statusCode).toBe(400);
    }
    expect((await request('GET', path, employee)).json()[key]).toEqual([]);
  });

  it('rejects holiday mass assignment, null/blank values, and empty patches', async () => {
    for (const extra of [{ createdBy: employee.context.employeeId }, { employeeId: employee.context.employeeId },
      { role: 'admin' }, { status: 'approved' }, { createdAt: new Date().toISOString() }, { id: missingId }, { unknown: true }]) {
      expect((await request('POST', '/holidays', admin, { ...holidayBody, ...extra })).statusCode).toBe(400);
      expect((await request('PATCH', `/holidays/${missingId}`, admin, { ...holidayBody, ...extra })).statusCode).toBe(400);
    }
    for (const body of [{}, { name: null }, { name: '  ' }, { date: null }, { date: 'not-a-date' }, { name: 'Only name', date: null }]) {
      expect((await request('PATCH', `/holidays/${missingId}`, admin, body)).statusCode).toBe(400);
    }
    expect((await request('DELETE', `/holidays/${missingId}`, admin, { employeeId: employee.context.employeeId })).statusCode).toBe(400);
  });

  it('requires CSRF and exact Origin on every mutation', async () => {
    const leaveId = (await request('POST', '/leave-requests', admin, leaveBody)).json().leaveRequest.id;
    const dailyId = (await request('POST', '/daily-updates', admin, dailyBody)).json().dailyUpdate.id;
    const id = (await request('POST', '/holidays', admin, holidayBody)).json().holiday.id;
    for (const [method, url, body] of [
      ['POST', '/leave-requests', { startDate: '2024-03-10', endDate: '2024-03-12' }],
      ['PATCH', `/leave-requests/${leaveId}`, { reason: 'Later' }],
      ['POST', '/daily-updates', { workDate: '2024-02-10', content: 'New day' }],
      ['PATCH', `/daily-updates/${dailyId}`, { content: 'Later' }],
      ['POST', '/holidays', { name: 'New', date: '2024-03-01' }],
      ['PATCH', `/holidays/${id}`, holidayBody], ['DELETE', `/holidays/${id}`, undefined],
    ] as const) {
      for (const headers of [{}, { 'x-csrf-token': 'wrong' },
        { 'x-csrf-token': admin.context.csrfToken, origin: 'http://127.0.0.1:3001' },
        { 'x-csrf-token': admin.context.csrfToken, origin: 'http://127.0.0.1:3000.evil.test' }]) {
        const result = await request(method, url, admin, body, headers);
        expect(result.statusCode, url).toBe(403);
        expect(result.headers['cache-control']).toBe('no-store');
      }
      expect((await request(method, url, admin, body,
        { 'x-csrf-token': admin.context.csrfToken, origin: 'http://127.0.0.1:3000' })).statusCode)
        .toBe(method === 'POST' ? 201 : method === 'DELETE' ? 204 : 200);
    }
  });

  it.each(['2025-02-29', '1900-02-29', '2024-04-31', '2024-13-01', '0000-01-01', '2024-02-29T00:00:00Z'])
    ('rejects invalid calendar date %s on all creation and edit surfaces', async (date) => {
      expect((await request('POST', '/leave-requests', employee, { startDate: date, endDate: date })).statusCode).toBe(400);
      expect((await request('PATCH', `/leave-requests/${missingId}`, employee, { startDate: date })).statusCode).toBe(400);
      expect((await request('POST', '/daily-updates', employee, { workDate: date, content: 'Text' })).statusCode).toBe(400);
      expect((await request('PATCH', `/daily-updates/${missingId}`, employee, { workDate: date })).statusCode).toBe(400);
      expect((await request('POST', '/holidays', admin, { name: 'Name', date })).statusCode).toBe(400);
      expect((await request('PATCH', `/holidays/${missingId}`, admin, { name: 'Name', date })).statusCode).toBe(400);
    });

  it('accepts leap day, trims text, leaves omitted reason null, and returns safe fields/plain text', async () => {
    const leave = await request('POST', '/leave-requests', employee, { startDate: '2024-02-29', endDate: '2024-02-29' });
    expect(leave.statusCode).toBe(201);
    expect(leave.json().leaveRequest.reason).toBeNull();
    expect(Object.keys(leave.json().leaveRequest).sort()).toEqual(['id', 'employeeId', 'startDate', 'endDate', 'reason', 'createdAt', 'updatedAt'].sort());
    const markup = '<script>alert("plain text")</script>';
    const daily = await request('POST', '/daily-updates', employee, { workDate: '2024-02-29', content: ` ${markup} ` });
    expect(daily.statusCode).toBe(201);
    expect(daily.json().dailyUpdate.content).toBe(markup);
    expect(daily.headers['content-type']).toContain('application/json');
    expect(Object.keys(daily.json().dailyUpdate).sort()).toEqual(['id', 'employeeId', 'workDate', 'content', 'createdAt', 'updatedAt'].sort());
    const holiday = await request('POST', '/holidays', admin, holidayBody);
    expect(holiday.statusCode).toBe(201);
    expect(holiday.json().holiday.name).toBe('Holiday');
    expect(Object.keys(holiday.json().holiday).sort()).toEqual(['id', 'name', 'date', 'createdAt', 'updatedAt'].sort());
    for (const response of [leave, daily, holiday]) {
      expect(response.body).not.toMatch(/private-sub|csrf|token|session|google|createdBy|status|approved/);
      expect(response.headers['cache-control']).toBe('no-store');
    }
  });

  it('enforces text bounds, optional reason semantics, required workDate and date ordering', async () => {
    for (const reason of ['', '  ', null, 7, 'x'.repeat(2001)]) {
      expect((await request('POST', '/leave-requests', employee, { ...leaveBody, reason })).statusCode).toBe(400);
    }
    for (const content of ['', '\n\t', null, 7, 'x'.repeat(5001)]) {
      expect((await request('POST', '/daily-updates', employee, { ...dailyBody, content })).statusCode).toBe(400);
    }
    for (const name of ['', '\t ', null, 7, 'x'.repeat(201)]) {
      expect((await request('POST', '/holidays', admin, { ...holidayBody, name })).statusCode).toBe(400);
    }
    expect((await request('POST', '/daily-updates', employee, { content: 'Missing date' })).statusCode).toBe(400);
    expect((await request('POST', '/leave-requests', employee, { startDate: '2024-03-01', endDate: '2024-02-29' })).statusCode).toBe(400);
    expect((await request('POST', '/leave-requests', employee, { ...leaveBody, reason: 'x'.repeat(2000) })).statusCode).toBe(201);
    expect((await request('POST', '/daily-updates', employee, { ...dailyBody, content: 'x'.repeat(5000) })).statusCode).toBe(201);
    expect((await request('POST', '/holidays', admin, { ...holidayBody, name: 'x'.repeat(200) })).statusCode).toBe(201);
  });

  it('rejects all inclusive overlap shapes, accepts adjacency, and permits past/future requests', async () => {
    const base = { startDate: '2024-03-10', endDate: '2024-03-20' };
    expect((await request('POST', '/leave-requests', employee, base)).statusCode).toBe(201);
    for (const [startDate, endDate] of [
      ['2024-03-10', '2024-03-20'], ['2024-03-12', '2024-03-15'], ['2024-03-01', '2024-03-30'],
      ['2024-03-01', '2024-03-10'], ['2024-03-20', '2024-03-22'],
    ]) expect((await request('POST', '/leave-requests', employee, { startDate, endDate })).statusCode).toBe(409);
    for (const [startDate, endDate] of [['2024-03-01', '2024-03-09'], ['2024-03-21', '2024-03-25'], ['2099-01-01', '2099-01-02']]) {
      expect((await request('POST', '/leave-requests', employee, { startDate, endDate })).statusCode).toBe(201);
    }
    expect((await request('POST', '/leave-requests', other, base)).statusCode).toBe(201);
  });

  it('patches leave requests only for their owner and validates the merged record', async () => {
    const created = (await request('POST', '/leave-requests', employee, { startDate: '2024-03-01', endDate: '2024-03-05', reason: 'Trip' })).json().leaveRequest;
    await request('POST', '/leave-requests', employee, { startDate: '2024-03-10', endDate: '2024-03-12' });
    await request('POST', '/leave-requests', other, { startDate: '2024-03-01', endDate: '2024-03-05' });

    // Other employees — including admins — cannot edit someone else's request.
    expect((await request('PATCH', `/leave-requests/${created.id}`, other, { reason: 'Hijack' })).statusCode).toBe(404);
    expect((await request('PATCH', `/leave-requests/${created.id}`, admin, { reason: 'Hijack' })).statusCode).toBe(404);
    expect((await request('PATCH', `/leave-requests/${missingId}`, employee, { reason: 'Ghost' })).statusCode).toBe(404);
    expect((await testPool().query('SELECT reason FROM leave_requests WHERE id = $1', [created.id])).rows[0].reason).toBe('Trip');

    // Single field: omitted fields unchanged, createdAt stable, updatedAt moves.
    const single = await request('PATCH', `/leave-requests/${created.id}`, employee, { reason: ' Renamed trip ' });
    expect(single.statusCode).toBe(200);
    expect(single.json().leaveRequest.reason).toBe('Renamed trip');
    expect(single.json().leaveRequest.startDate).toBe('2024-03-01');
    expect(single.json().leaveRequest.endDate).toBe('2024-03-05');
    expect(single.json().leaveRequest.createdAt).toBe(created.createdAt);
    expect(single.json().leaveRequest.updatedAt).not.toBe(created.updatedAt);

    // Multi field with an omitted reason keeps the stored reason.
    const multi = await request('PATCH', `/leave-requests/${created.id}`, employee, { startDate: '2024-03-06', endDate: '2024-03-07' });
    expect(multi.statusCode).toBe(200);
    expect(multi.json().leaveRequest.reason).toBe('Renamed trip');

    // Merged validation: the FINAL record must be a valid range.
    expect((await request('PATCH', `/leave-requests/${created.id}`, employee, { endDate: '2024-03-05' })).statusCode).toBe(400);
    expect((await request('PATCH', `/leave-requests/${created.id}`, employee, { startDate: '2024-03-11' })).statusCode).toBe(400);

    // Overlap excludes the current record; adjacency is accepted.
    expect((await request('PATCH', `/leave-requests/${created.id}`, employee, { startDate: '2024-03-09', endDate: '2024-03-20' })).statusCode).toBe(409);
    expect((await request('PATCH', `/leave-requests/${created.id}`, employee, { endDate: '2024-03-09' })).statusCode).toBe(200);
    expect((await request('PATCH', `/leave-requests/${created.id}`, employee, { startDate: '2024-03-10', endDate: '2024-03-12' })).statusCode).toBe(409);

    // Null and blank reasons are not clear operations; empty patches are invalid.
    for (const body of [{ reason: null }, { reason: '' }, { reason: '  ' }, {}]) {
      expect((await request('PATCH', `/leave-requests/${created.id}`, employee, body)).statusCode).toBe(400);
    }
  });

  it('serializes leave edits against concurrent submissions with actual lock contention', async () => {
    const created = (await request('POST', '/leave-requests', employee, { startDate: '2024-05-01', endDate: '2024-05-05' })).json().leaveRequest;
    const blocker = await testPool().connect();
    let pending: Promise<unknown> | undefined;
    try {
      await blocker.query('BEGIN');
      await blocker.query('SELECT id FROM employees WHERE id = $1 FOR UPDATE', [employee.context.employeeId]);
      const results = Promise.all([
        request('PATCH', `/leave-requests/${created.id}`, employee, { startDate: '2024-06-01', endDate: '2024-06-05' }),
        request('POST', '/leave-requests', employee, { startDate: '2024-06-04', endDate: '2024-06-07' }),
      ]);
      pending = results;
      await waitForBlockedQuery('SELECT role, is_active FROM employees', 2);
      await blocker.query('COMMIT');
      expect((await results).map((r) => r.statusCode).sort()).toEqual([200, 409]);
      // Whatever the commit order, the surviving ranges never intersect.
      const rows = (await testPool().query('SELECT start_date, end_date FROM leave_requests ORDER BY start_date')).rows;
      for (let i = 1; i < rows.length; i++) expect(rows[i - 1].end_date < rows[i].start_date).toBe(true);
    } finally {
      await blocker.query('ROLLBACK'); blocker.release(); await pending;
    }
  });

  it('patches daily updates only for their owner and revalidates the merged record', async () => {
    const created = (await request('POST', '/daily-updates', employee, { workDate: '2024-02-01', content: 'First' })).json().dailyUpdate;
    await request('POST', '/daily-updates', employee, { workDate: '2024-02-03', content: 'Third' });
    await request('POST', '/daily-updates', other, { workDate: '2024-02-05', content: 'Other' });

    // Other employees — including admins — cannot edit someone else's update.
    expect((await request('PATCH', `/daily-updates/${created.id}`, admin, { content: 'Hijack' })).statusCode).toBe(404);
    expect((await request('PATCH', `/daily-updates/${created.id}`, other, { content: 'Hijack' })).statusCode).toBe(404);
    expect((await request('PATCH', `/daily-updates/${missingId}`, employee, { content: 'Ghost' })).statusCode).toBe(404);
    expect((await testPool().query('SELECT content FROM daily_updates WHERE id = $1', [created.id])).rows[0].content).toBe('First');

    // Single field: omitted content unchanged, createdAt stable, updatedAt moves.
    const patched = await request('PATCH', `/daily-updates/${created.id}`, employee, { content: ' Updated ' });
    expect(patched.statusCode).toBe(200);
    expect(patched.json().dailyUpdate.content).toBe('Updated');
    expect(patched.json().dailyUpdate.workDate).toBe('2024-02-01');
    expect(patched.json().dailyUpdate.createdAt).toBe(created.createdAt);
    expect(patched.json().dailyUpdate.updatedAt).not.toBe(created.updatedAt);

    // Moving to a date this employee already uses conflicts; another employee's date is allowed.
    expect((await request('PATCH', `/daily-updates/${created.id}`, employee, { workDate: '2024-02-03' })).statusCode).toBe(409);
    expect((await request('PATCH', `/daily-updates/${created.id}`, employee, { workDate: '2024-02-05' })).statusCode).toBe(200);

    // Future work dates stay rejected through the merged record; backdating is allowed.
    expect((await request('PATCH', `/daily-updates/${created.id}`, employee, { workDate: '2099-01-01' })).statusCode).toBe(400);
    expect((await request('PATCH', `/daily-updates/${created.id}`, employee, { workDate: '2020-01-01', content: 'Backdated' })).statusCode).toBe(200);
  });

  it('serializes overlapping submissions with actual PostgreSQL lock contention', async () => {
    const second = await createSession(employee.context.employeeId);
    const blocker = await testPool().connect();
    let pending: Promise<unknown> | undefined;
    try {
      await blocker.query('BEGIN');
      await blocker.query('SELECT id FROM employees WHERE id = $1 FOR UPDATE', [employee.context.employeeId]);
      const results = Promise.all([
        request('POST', '/leave-requests', employee, { startDate: '2024-05-01', endDate: '2024-05-05' }),
        request('POST', '/leave-requests', second, { startDate: '2024-05-04', endDate: '2024-05-07' }),
      ]);
      pending = results;
      await waitForBlockedQuery('SELECT role, is_active FROM employees', 2);
      await blocker.query('COMMIT');
      expect((await results).map((r) => r.statusCode).sort()).toEqual([201, 409]);
      expect((await testPool().query('SELECT * FROM leave_requests')).rowCount).toBe(1);
    } finally {
      await blocker.query('ROLLBACK'); blocker.release(); await pending;
    }
  });

  it('enforces concurrent daily uniqueness in PostgreSQL and permits the same date for another employee', async () => {
    const second = await createSession(employee.context.employeeId);
    const result = await Promise.all([
      request('POST', '/daily-updates', employee, dailyBody), request('POST', '/daily-updates', second, dailyBody),
    ]);
    expect(result.map((r) => r.statusCode).sort()).toEqual([201, 409]);
    expect((await request('POST', '/daily-updates', other, dailyBody)).statusCode).toBe(201);
    await expect(testPool().query('INSERT INTO daily_updates (employee_id, work_date, content) VALUES ($1, $2, $3)',
      [employee.context.employeeId, dailyBody.workDate, 'duplicate']))
      .rejects.toMatchObject({ code: '23505', constraint: 'daily_updates_employee_work_date_unique_idx' });
    const inserts = await Promise.allSettled([1, 2].map(() => testPool().query(
      "INSERT INTO daily_updates (employee_id, work_date, content) VALUES ($1, '2024-01-01', 'race')", [employee.context.employeeId])));
    expect(inserts.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(inserts.find((result) => result.status === 'rejected')).toMatchObject({ reason: { code: '23505' } });
  });

  it('uses the company date/year, accepts backdating, and rejects future updates across UTC midnight', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-12-31T20:00:00Z')); // Jan 1 in configured Asia/Kolkata.
    expect(companyDate()).toBe('2027-01-01');
    expect((await request('POST', '/daily-updates', employee, { workDate: '2027-01-01', content: 'Today' })).statusCode).toBe(201);
    expect((await request('POST', '/daily-updates', employee, { workDate: '2026-12-31', content: 'Yesterday' })).statusCode).toBe(201);
    expect((await request('POST', '/daily-updates', employee, { workDate: '2027-01-02', content: 'Future' })).statusCode).toBe(400);
    await request('POST', '/holidays', admin, { name: 'Next year', date: '2027-01-01' });
    await request('POST', '/holidays', admin, { name: 'Old year', date: '2026-12-31' });
    const result = await request('GET', '/holidays', employee);
    expect(result.json().holidays.map((item: { date: string }) => item.date)).toEqual(['2027-01-01']);
  });

  it('filters leave by intersection and daily updates by inclusive work date', async () => {
    await request('POST', '/leave-requests', employee, { startDate: '2024-02-01', endDate: '2024-02-10' });
    await request('POST', '/leave-requests', employee, { startDate: '2024-02-20', endDate: '2024-02-25' });
    expect((await request('GET', '/leave-requests?fromDate=2024-02-10&toDate=2024-02-20', employee)).json().leaveRequests).toHaveLength(2);
    expect((await request('GET', '/leave-requests?fromDate=2024-02-11&toDate=2024-02-19', employee)).json().leaveRequests).toEqual([]);
    expect((await request('GET', '/leave-requests?toDate=2024-02-05', employee)).json().leaveRequests).toHaveLength(1);
    for (const workDate of ['2024-02-01', '2024-02-10', '2024-02-20']) await request('POST', '/daily-updates', employee, { workDate, content: workDate });
    expect((await request('GET', '/daily-updates?fromDate=2024-02-10&toDate=2024-02-20', employee)).json().dailyUpdates).toHaveLength(2);
    expect((await request('GET', '/daily-updates?fromDate=2024-02-10&toDate=2024-02-10', employee)).json().dailyUpdates).toHaveLength(1);
  });

  it.each(recordModules)('bounds $path pagination/filters and orders by created_at DESC, id DESC', async ({ path, key }) => {
    const owner = employee.context.employeeId;
    // Fixed timestamps make the ID tie-breaker observable.
    if (path === '/leave-requests') {
      await testPool().query(`INSERT INTO leave_requests (employee_id, start_date, end_date, created_at)
        SELECT $1, '2024-01-01'::date + n, '2024-01-01'::date + n, '2024-01-01'::timestamptz FROM generate_series(0,24) n`, [owner]);
    } else {
      await testPool().query(`INSERT INTO daily_updates (employee_id, work_date, content, created_at)
        SELECT $1, '2024-01-01'::date + n, 'Text', '2024-01-01'::timestamptz FROM generate_series(0,24) n`, [owner]);
    }
    const first = (await request('GET', path, employee)).json();
    expect(first.limit).toBe(20); expect(first.offset).toBe(0); expect(first[key]).toHaveLength(20);
    const rest = (await request('GET', `${path}?offset=20&limit=100`, employee)).json()[key];
    expect(rest).toHaveLength(5);
    const ids = [...first[key], ...rest].map((item) => item.id);
    expect(ids).toEqual([...ids].sort().reverse()); expect(new Set(ids).size).toBe(25);
    expect((await request('GET', path, employee)).json()).toEqual(first);
    for (const query of ['limit=0', 'limit=101', 'limit=1.5', 'offset=-1', 'offset=1000001', 'scope=team',
      'fromDate=2025-02-29', 'fromDate=2024-03-01&toDate=2024-02-01', 'employeeId=invalid',
      'workDate=2024-01-01', 'unknown=x', 'limit=20&limit=30', 'fromDate=%27%20OR%201%3D1--']) {
      expect((await request('GET', `${path}?${query}`, employee)).statusCode, query).toBe(400);
    }
  });

  it('supports holiday patches, duplicates, missing IDs, ordered pagination and deletion', async () => {
    const created = await request('POST', '/holidays', admin, holidayBody);
    const id = created.json().holiday.id;
    expect((await request('POST', '/holidays', admin, holidayBody)).statusCode).toBe(409);
    await request('POST', '/holidays', admin, { name: 'Earlier', date: '2024-01-01' });

    // Partial edit: omitted fields preserved, only changed fields audited.
    const renamed = await request('PATCH', `/holidays/${id}`, admin, { name: ' Renamed ' });
    expect(renamed.statusCode).toBe(200);
    expect(renamed.json().holiday.name).toBe('Renamed');
    expect(renamed.json().holiday.date).toBe('2024-02-29');
    expect(renamed.json().holiday.createdAt).toBe(created.json().holiday.createdAt);
    expect(renamed.json().holiday.updatedAt).not.toBe(created.json().holiday.updatedAt);

    // A no-op patch changes nothing — timestamps and audit history included.
    const noop = await request('PATCH', `/holidays/${id}`, admin, { name: 'Renamed', date: '2024-02-29' });
    expect(noop.statusCode).toBe(200);
    expect(noop.json().holiday).toEqual(renamed.json().holiday);

    // Duplicate target date conflicts.
    expect((await request('PATCH', `/holidays/${id}`, admin, { date: '2024-01-01' })).statusCode).toBe(409);

    // PUT was removed: the route no longer exists and cannot modify anything.
    expect((await request('PUT', `/holidays/${id}`, admin, { name: 'X', date: '2024-02-29' })).statusCode).toBe(404);
    expect((await testPool().query('SELECT name FROM holidays WHERE id = $1', [id])).rows[0].name).toBe('Renamed');

    const list = await request('GET', '/holidays?year=2024', employee);
    expect(list.json().holidays.map((item: { date: string }) => item.date)).toEqual(['2024-01-01', '2024-02-29']);
    expect((await request('GET', '/holidays?year=2024&limit=1&offset=1', employee)).json().holidays[0].id).toBe(id);
    for (const query of ['year=0000', 'year=10000', 'year=24', 'year=2024.5', 'limit=101', 'offset=-1', 'unknown=1']) {
      expect((await request('GET', `/holidays?${query}`, employee)).statusCode).toBe(400);
    }
    for (const method of ['PATCH', 'DELETE'] as const) {
      expect((await request(method, `/holidays/${missingId}`, admin, method === 'PATCH' ? { name: 'X' } : undefined)).statusCode).toBe(404);
      expect((await request(method, '/holidays/not-uuid', admin, method === 'PATCH' ? { name: 'X' } : undefined)).statusCode).toBe(400);
    }
    const deleted = await request('DELETE', `/holidays/${id}`, admin);
    expect(deleted.statusCode).toBe(204); expect(deleted.body).toBe('');
    expect((await request('DELETE', `/holidays/${id}`, admin)).statusCode).toBe(404);
    expect((await request('GET', '/holidays?year=2024', employee)).json().holidays).toHaveLength(1);
    const audit = (await testPool().query('SELECT * FROM holiday_audit_events WHERE holiday_id = $1 ORDER BY created_at', [id])).rows;
    expect(audit.map((item) => item.action)).toEqual(['holiday.created', 'holiday.updated', 'holiday.deleted']);
    expect(audit.every((item) => item.actor_id === admin.context.employeeId)).toBe(true);
    expect(audit[1].changed_fields).toEqual(['name']);
    expect(JSON.stringify(audit)).not.toMatch(/Renamed|Holiday|Private reason|Completed work/);
  });

  it('enforces concurrent holiday uniqueness in PostgreSQL', async () => {
    const second = await createSession(await seedEmployee({ email: 'admin2@transacty.ai', role: 'admin' }));
    const results = await Promise.all([request('POST', '/holidays', admin, holidayBody), request('POST', '/holidays', second, holidayBody)]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([201, 409]);
    expect((await testPool().query('SELECT * FROM holidays')).rowCount).toBe(1);
    expect((await testPool().query('SELECT * FROM holiday_audit_events')).rowCount).toBe(1);
    await expect(testPool().query("INSERT INTO holidays (name, date, created_by) VALUES ('Other', $1, $2)",
      [holidayBody.date, admin.context.employeeId])).rejects.toMatchObject({ code: '23505', constraint: 'holidays_date_unique_idx' });
  });

  it('keeps holiday writes and persistent audits atomic on database failure', async () => {
    const id = (await request('POST', '/holidays', admin, holidayBody)).json().holiday.id;
    await testPool().query('ALTER TABLE holiday_audit_events ADD CONSTRAINT test_reject_holiday_audit CHECK (false) NOT VALID');
    try {
      for (const [method, url, body] of [
        ['POST', '/holidays', { name: 'Private fail', date: '2024-05-01' }],
        ['PATCH', `/holidays/${id}`, { name: 'Private fail', date: '2024-05-01' }],
        ['DELETE', `/holidays/${id}`, undefined],
      ] as const) {
        const response = await request(method, url, admin, body);
        expect(response.statusCode).toBe(500);
        expect(response.json().message).toBe('Internal server error');
        expect(response.body).not.toMatch(/Private fail|INSERT|constraint|23514/);
      }
      const rows = (await testPool().query('SELECT name, date FROM holidays')).rows;
      expect(rows).toEqual([{ name: 'Holiday', date: '2024-02-29' }]);
      expect((await testPool().query('SELECT * FROM holiday_audit_events')).rowCount).toBe(1);
    } finally { await testPool().query('ALTER TABLE holiday_audit_events DROP CONSTRAINT test_reject_holiday_audit'); }
  });

  it('enforces date range and restrictive employee FKs without cascading business history', async () => {
    await expect(testPool().query('INSERT INTO leave_requests (employee_id, start_date, end_date) VALUES ($1, $2, $3)',
      [employee.context.employeeId, '2024-03-01', '2024-02-29']))
      .rejects.toMatchObject({ code: '23514', constraint: 'leave_requests_dates_check' });
    await request('POST', '/leave-requests', employee, leaveBody);
    await request('POST', '/daily-updates', other, dailyBody);
    await request('POST', '/holidays', admin, holidayBody);
    for (const session of [employee, other, admin]) {
      await expect(testPool().query('DELETE FROM employees WHERE id = $1', [session.context.employeeId]))
        .rejects.toMatchObject({ code: '23503' });
    }
    expect((await testPool().query('SELECT * FROM leave_requests')).rowCount).toBe(1);
    expect((await testPool().query('SELECT * FROM daily_updates')).rowCount).toBe(1);
    expect((await testPool().query('SELECT * FROM holidays')).rowCount).toBe(1);
  });

  it('rechecks active status, session and current admin role inside business transactions', async () => {
    await testPool().query("UPDATE employees SET role = 'employee' WHERE id = $1", [admin.context.employeeId]);
    await expect(createHoliday(admin.context, holidayBody)).rejects.toMatchObject({ statusCode: 403 });
    await testPool().query('UPDATE employees SET is_active = false WHERE id = $1', [employee.context.employeeId]);
    await expect(createLeaveRequest(employee.context, leaveBody)).rejects.toMatchObject({ statusCode: 401 });
    await expect(createDailyUpdate(employee.context, dailyBody)).rejects.toMatchObject({ statusCode: 401 });
    await testPool().query('UPDATE sessions SET revoked_at = now() WHERE id = $1', [other.context.sessionId]);
    await expect(createDailyUpdate(other.context, dailyBody)).rejects.toMatchObject({ statusCode: 401 });
  });

  it('rejects oversized bodies and malformed JSON without echoing sensitive text', async () => {
    const logs: unknown[] = [];
    app.addHook('onRequest', async (req) => {
      vi.spyOn(req.log, 'info').mockImplementation((...args: unknown[]) => { logs.push(args); });
      vi.spyOn(req.log, 'error').mockImplementation((...args: unknown[]) => { logs.push(args); });
    });
    for (const path of ['/leave-requests', '/daily-updates', '/holidays']) {
      const invalid = await request('POST', path, admin, '{"reason":"PRIVATE-LEAVE-TEXT","content":"PRIVATE-WORK-TEXT",oops}',
        { 'content-type': 'application/json', 'x-csrf-token': admin.context.csrfToken });
      expect(invalid.statusCode).toBe(400);
      expect(invalid.body).not.toMatch(/PRIVATE|oops/);
      const large = await request('POST', path, admin, { content: 'x'.repeat(65537) });
      expect(large.statusCode).toBe(413);
      expect(large.headers['cache-control']).toBe('no-store');
      const invalidPatch = await request('PATCH', `${path}/${missingId}`, admin, '{"name":"PRIVATE-PATCH-TEXT",oops}',
        { 'content-type': 'application/json', 'x-csrf-token': admin.context.csrfToken });
      expect(invalidPatch.statusCode).toBe(400);
      expect(invalidPatch.body).not.toMatch(/PRIVATE|oops/);
      const largePatch = await request('PATCH', `${path}/${missingId}`, admin, { name: 'x'.repeat(65537) });
      expect(largePatch.statusCode).toBe(413);
      expect(largePatch.headers['cache-control']).toBe('no-store');
    }
    // The spy captures raw logger arguments BEFORE pino serializes them. Real
    // logging serializes framework req/res objects down to safe scalars (the
    // serializers configured on the app) and err objects down to name/message/
    // stack. Replicate that reduction so the assertion reflects what would
    // actually be written to disk; raw object graphs never leave the process.
    const serialized = JSON.stringify(logs, (key, value) => {
      if (key === '' || typeof value !== 'object' || value === null || Array.isArray(value)) return value;
      if (key === 'req') return { method: value.method, url: String(value.url ?? '/').split('?')[0] };
      if (key === 'res') return { statusCode: value.statusCode };
      if (key === 'err') return { name: value.name, message: value.message, stack: value.stack };
      return value;
    });
    expect(serialized).not.toMatch(/PRIVATE|oops/);
  });

  it('bounds mutations with the existing per-IP rate-limit plugin', async () => {
    for (let i = 0; i < 30; i++) {
      expect((await request('POST', '/daily-updates', employee, {})).statusCode).toBe(400);
    }
    expect((await request('POST', '/daily-updates', employee, dailyBody)).statusCode).toBe(429);
  });
});
