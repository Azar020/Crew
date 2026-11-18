import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { createSession, type CreatedSession } from '../src/modules/auth/service.js';
import { checkIn, checkOut } from '../src/modules/attendance/service.js';
import { databaseAvailable, resetTables, seedEmployee, testPool, closeTestPool } from './helpers/db.js';
import { waitForBlockedQuery } from './helpers/locks.js';

const available = await databaseAvailable();
const IN = 'Asia/Kolkata';
const NG = 'Africa/Lagos';
const recordKeys = ['id', 'employeeId', 'workDate', 'timezoneAtCheckIn', 'checkedInAt',
  'checkedOutAt', 'createdAt', 'updatedAt'].sort();
const statusKeys = ['timezone', 'localDate', 'state', 'canCheckIn', 'canCheckOut',
  'openSession', 'todayCompletedRecord'].sort();
const missingId = '11111111-1111-4111-8111-111111111111';

describe.skipIf(!available)('attendance (real PostgreSQL)', () => {
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
    otherId = await seedEmployee({ email: 'bob@n23digitals.com', name: 'Bob', timezone: NG });
    employee = await createSession(employeeId);
    other = await createSession(otherId);
  });
  afterEach(async () => { await app.close(); });
  afterAll(closeTestPool);

  function request(method: 'GET' | 'POST' | 'PATCH', url: string, session?: CreatedSession,
    body?: object, headers?: Record<string, string>) {
    return app.inject({
      method, url,
      ...(session ? { cookies: { teamdesk_session: session.cookieToken } } : {}),
      ...(body !== undefined ? { payload: body } : {}),
      headers: headers ?? (session ? { 'x-csrf-token': session.context.csrfToken } : {}),
    });
  }

  /** Inserts an attendance row directly (for historical/forgotten sessions). */
  async function seedAttendance(id: string, options: { workDate: string; checkedInAt: string;
    checkedOutAt?: string; timezone?: string }) {
    await testPool().query(
      `INSERT INTO attendance (employee_id, work_date, timezone_at_check_in, checked_in_at, checked_out_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, options.workDate, options.timezone ?? IN, options.checkedInAt, options.checkedOutAt ?? null],
    );
  }

  it.each(['missing', 'invalid', 'expired', 'inactive', 'revoked'])('denies %s authentication on every attendance endpoint', async (state) => {
    if (state === 'expired') await testPool().query("UPDATE sessions SET absolute_expires_at = now() - interval '1 second'");
    if (state === 'inactive') await testPool().query('UPDATE employees SET is_active = false');
    if (state === 'revoked') await testPool().query('UPDATE sessions SET revoked_at = now()');
    const session = state === 'missing' ? undefined : state === 'invalid' ? { ...employee, cookieToken: 'invalid' } : employee;
    for (const [method, url] of [
      ['POST', '/attendance/check-in'], ['POST', '/attendance/check-out'],
      ['GET', '/attendance/status'], ['GET', '/attendance/me'], ['GET', '/attendance'],
    ] as const) {
      const response = await request(method, url, session);
      expect(response.statusCode, `${method} ${url}`).toBe(401);
      expect(response.headers['cache-control']).toBe('no-store');
    }
  });

  it('applies CSRF and exact-Origin protection to both mutations', async () => {
    for (const [url, success] of [['/attendance/check-in', 201], ['/attendance/check-out', 200]] as const) {
      for (const headers of [{}, { 'x-csrf-token': 'wrong' },
        { 'x-csrf-token': employee.context.csrfToken, origin: 'http://127.0.0.1:3001' },
        { 'x-csrf-token': employee.context.csrfToken, origin: 'http://127.0.0.1:3000.evil.test' }]) {
        const response = await request('POST', url, employee, undefined, headers);
        expect(response.statusCode, url).toBe(403);
        expect(response.headers['cache-control']).toBe('no-store');
      }
      const response = await request('POST', url, employee, undefined, {
        'x-csrf-token': employee.context.csrfToken, origin: 'http://127.0.0.1:3000',
      });
      expect(response.statusCode, url).toBe(success);
    }
  });

  it('accepts no body at all, rejecting client-supplied identity/time fields', async () => {
    await seedAttendance(employeeId, { workDate: '2026-01-05', checkedInAt: '2026-01-05T04:30:00Z' });
    for (const body of [{}, { employeeId: otherId }, { workDate: '2026-01-05' }, { timezone: NG },
      { checkedInAt: new Date().toISOString() }, { checkedOutAt: new Date().toISOString() },
      { id: missingId }, { createdAt: new Date().toISOString() }, { unknown: true }]) {
      const checkInAttempt = await request('POST', '/attendance/check-in', employee, body);
      expect(checkInAttempt.statusCode, JSON.stringify(body)).toBe(400);
      const checkOutAttempt = await request('POST', '/attendance/check-out', employee, body);
      expect(checkOutAttempt.statusCode, JSON.stringify(body)).toBe(400);
    }
    // Nothing was written and the forgotten session was not touched.
    expect((await testPool().query('SELECT * FROM attendance')).rowCount).toBe(1);
    expect((await testPool().query('SELECT * FROM attendance_audit_events')).rowCount).toBe(0);
  });

  it('reports every state with exact flags, derives localDate in the employee timezone, and blocks unconfigured check-in', async () => {
    // Unconfigured (NULL timezone): attendance fails closed, login is unaffected.
    const unconfiguredId = await seedEmployee({ email: 'notz@transacty.ai', name: 'No Tz' });
    const unconfigured = await createSession(unconfiguredId);
    const blocked = await request('GET', '/attendance/status', unconfigured);
    expect(blocked.statusCode).toBe(200);
    expect(blocked.json()).toEqual({
      timezone: null, localDate: null, state: 'not_checked_in',
      canCheckIn: false, canCheckOut: false, openSession: null, todayCompletedRecord: null,
    });
    const denied = await request('POST', '/attendance/check-in', unconfigured);
    expect(denied.statusCode).toBe(400);
    expect(denied.json().message).toBe(
      'Attendance is not configured for this account yet: ask an administrator to set your work timezone');
    expect((await testPool().query('SELECT * FROM attendance')).rowCount).toBe(0);

    // Configured but not checked in.
    const before = await request('GET', '/attendance/status', employee);
    expect(before.statusCode).toBe(200);
    expect(Object.keys(before.json()).sort()).toEqual(statusKeys);
    expect(before.json()).toMatchObject({ timezone: IN, state: 'not_checked_in',
      canCheckIn: true, canCheckOut: false, openSession: null, todayCompletedRecord: null });
    const localDate = before.json().localDate;
    expect(localDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    // Checked in: 201 with a safe record keyed as { attendance }.
    const checkInResponse = await request('POST', '/attendance/check-in', employee);
    expect(checkInResponse.statusCode).toBe(201);
    expect(Object.keys(checkInResponse.json().attendance).sort()).toEqual(recordKeys);
    const record = checkInResponse.json().attendance;
    expect(record).toMatchObject({ employeeId, timezoneAtCheckIn: IN, workDate: localDate, checkedOutAt: null });
    const during = await request('GET', '/attendance/status', employee);
    expect(during.json()).toMatchObject({ state: 'checked_in', canCheckIn: false, canCheckOut: true,
      openSession: record, todayCompletedRecord: null });
    // A second check-in while open conflicts on the open session.
    expect((await request('POST', '/attendance/check-in', employee)).statusCode).toBe(409);

    // Checked out: 200 with derived duration; state flags flip; re-check-in conflicts on the work date.
    const checkOutResponse = await request('POST', '/attendance/check-out', employee);
    expect(checkOutResponse.statusCode).toBe(200);
    expect(Object.keys(checkOutResponse.json()).sort()).toEqual(['attendance', 'sessionDurationSeconds'].sort());
    // Elapsed time in whole seconds; a same-instant round trip may round to 0.
    expect(checkOutResponse.json().sessionDurationSeconds).toBeGreaterThanOrEqual(0);
    const after = await request('GET', '/attendance/status', employee);
    expect(after.json()).toMatchObject({ state: 'checked_out', canCheckIn: false, canCheckOut: false,
      openSession: null, todayCompletedRecord: checkOutResponse.json().attendance });
    expect((await request('POST', '/attendance/check-in', employee)).json().message).toBe(
      'Attendance has already been recorded for this work date');
    expect((await request('POST', '/attendance/check-in', employee)).statusCode).toBe(409);
    // Checkout without an open session conflicts.
    expect((await request('POST', '/attendance/check-out', employee)).statusCode).toBe(409);
  });

  it('derives India and Nigeria local dates from one trusted database instant', async () => {
    // Test-time control only; the same instant is captured once per check-in.
    const at = new Date('2026-01-01T19:00:00Z');
    const india = await checkIn(employee.context, { at });
    const nigeria = await checkIn(other.context, { at });
    expect(india).toMatchObject({ workDate: '2026-01-02', timezoneAtCheckIn: IN,
      checkedInAt: '2026-01-01T19:00:00.000Z', checkedOutAt: null });
    expect(nigeria).toMatchObject({ workDate: '2026-01-01', timezoneAtCheckIn: NG,
      checkedInAt: '2026-01-01T19:00:00.000Z', checkedOutAt: null });
    expect((await testPool().query('SELECT * FROM attendance')).rowCount).toBe(2);
  });

  it('survives a DST boundary via the timezone snapshot and keeps history stable across later timezone changes', async () => {
    const santiagoId = await seedEmployee({ email: 'santiago@transacty.ai', name: 'Santiago', timezone: 'America/Santiago' });
    const santiago = await createSession(santiagoId);
    // 2026-04-05T03:30:00Z falls inside the Chilean DST rollback window: the
    // stored zone resolves it to 2026-04-04 23:30 local, NOT the UTC date.
    const at = new Date('2026-04-05T03:30:00Z');
    const record = await checkIn(santiago.context, { at });
    const icuDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(at);
    expect(record.workDate).toBe('2026-04-04'); // UTC date would be 2026-04-05.
    expect(record.workDate).toBe(icuDate);
    expect(record.timezoneAtCheckIn).toBe('America/Santiago');
    await checkOut(santiago.context, { at: new Date('2026-04-05T04:30:00Z') });

    // A later timezone change never rewrites history or the snapshot.
    const changed = await request('PATCH', `/employees/${santiagoId}`, admin, { timezone: IN });
    expect(changed.statusCode).toBe(200);
    const history = (await request('GET', '/attendance/me', santiago)).json().attendance;
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ workDate: '2026-04-04', timezoneAtCheckIn: 'America/Santiago',
      checkedInAt: '2026-04-05T03:30:00.000Z', checkedOutAt: '2026-04-05T04:30:00.000Z' });
    const dbDate = (await testPool().query(
      "SELECT ($1::timestamptz AT TIME ZONE 'America/Santiago')::date::text AS d", [at.toISOString()])).rows[0].d;
    expect(dbDate).toBe('2026-04-04');
  });

  it('computes session duration across midnight and DST clock changes from stored timestamps only', async () => {
    // Kolkata: check-in 00:30 local Jan 2, check-out 08:30 local Jan 2.
    const india = await checkIn(employee.context, { at: new Date('2026-01-01T19:00:00Z') });
    const outIndia = await checkOut(employee.context, { at: new Date('2026-01-02T03:00:00Z') });
    expect(outIndia.sessionDurationSeconds).toBe(28800);
    expect(outIndia.attendance.workDate).toBe(india.workDate); // check-in local date preserved
    expect(outIndia.attendance.checkedInAt).toBe('2026-01-01T19:00:00.000Z');

    // Santiago spans the DST rollback: elapsed time is exactly 5h despite the
    // local clock jumping 00:30 -> 00:30 twice.
    const santiagoId = await seedEmployee({ email: 'santiago2@transacty.ai', timezone: 'America/Santiago' });
    const santiago = await createSession(santiagoId);
    await checkIn(santiago.context, { at: new Date('2026-04-05T03:30:00Z') });
    const out = await checkOut(santiago.context, { at: new Date('2026-04-05T08:30:00Z') });
    expect(out.sessionDurationSeconds).toBe(18000);
    // Duration is never persisted.
    const row = (await testPool().query('SELECT * FROM attendance WHERE employee_id = $1', [santiagoId])).rows[0];
    expect(Object.keys(row).sort()).toEqual(['id', 'employee_id', 'work_date', 'timezone_at_check_in',
      'checked_in_at', 'checked_out_at', 'created_at', 'updated_at'].sort());
  });

  it('enforces one open session and one record per local work date, including at the database level', async () => {
    const ctx = employee.context;
    const day1 = new Date('2026-01-01T19:00:00Z'); // Kolkata 2026-01-02
    const day2 = new Date('2026-01-02T19:00:00Z'); // Kolkata 2026-01-03
    const day3 = new Date('2026-01-03T19:00:00Z'); // Kolkata 2026-01-04
    await checkIn(ctx, { at: day1 });
    await checkOut(ctx, { at: new Date('2026-01-01T20:00:00Z') });
    // Same local work date after checkout conflicts; the next day is fine.
    await expect(checkIn(ctx, { at: new Date('2026-01-01T21:00:00Z') }))
      .rejects.toMatchObject({ statusCode: 409 });
    await checkIn(ctx, { at: day2 });
    // An open session blocks check-in even for a different local date.
    await expect(checkIn(ctx, { at: day3 })).rejects.toMatchObject({ statusCode: 409, message: 'An attendance session is already open' });
    await expect(checkIn(other.context, { at: day1 })).resolves.toBeTruthy(); // other employee unaffected

    const id = employeeId;
    await expect(testPool().query(
      `INSERT INTO attendance (employee_id, work_date, timezone_at_check_in, checked_in_at)
       VALUES ($1, '2026-01-02', $2, '2026-01-01T20:00:00Z')`, [id, IN]))
      .rejects.toMatchObject({ code: '23505', constraint: 'attendance_employee_work_date_unique_idx' });
    await expect(testPool().query(
      `INSERT INTO attendance (employee_id, work_date, timezone_at_check_in, checked_in_at)
       VALUES ($1, '2099-01-01', $2, '2026-01-01T20:00:00Z')`, [id, IN]))
      .rejects.toMatchObject({ code: '23505', constraint: 'attendance_open_session_unique_idx' });
    await expect(testPool().query(
      `INSERT INTO attendance (employee_id, work_date, timezone_at_check_in, checked_in_at, checked_out_at)
       VALUES ($1, '2099-01-02', $2, '2099-01-02T10:00:00Z', '2099-01-02T09:00:00Z')`, [id, IN]))
      .rejects.toMatchObject({ code: '23514', constraint: 'attendance_checkout_order_check' });
    await expect(testPool().query('DELETE FROM employees WHERE id = $1', [id]))
      .rejects.toMatchObject({ code: '23503' });
    expect((await testPool().query('SELECT * FROM attendance WHERE employee_id = $1', [id])).rowCount).toBe(2);
  });

  it('serializes concurrent check-ins so exactly one record and one audit exist', async () => {
    const second = await createSession(employeeId);
    const results = await Promise.all([
      request('POST', '/attendance/check-in', employee),
      request('POST', '/attendance/check-in', second),
    ]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([201, 409]);
    expect((await testPool().query('SELECT * FROM attendance')).rowCount).toBe(1);
    const audits = (await testPool().query('SELECT * FROM attendance_audit_events')).rows;
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ actor_id: employeeId, action: 'attendance.checked_in', changed_fields: ['checkedInAt'] });
    expect((await request('GET', '/attendance/status', employee)).json()).toMatchObject({ state: 'checked_in' });
  });

  it('serializes concurrent checkouts so the first close wins and is never overwritten', async () => {
    await request('POST', '/attendance/check-in', employee);
    const second = await createSession(employeeId);
    const results = await Promise.all([
      request('POST', '/attendance/check-out', employee),
      request('POST', '/attendance/check-out', second),
    ]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    const winner = results.find((r) => r.statusCode === 200)!.json();
    const row = (await testPool().query('SELECT * FROM attendance')).rows[0];
    expect(row.checked_out_at).toBeInstanceOf(Date);
    expect(new Date(row.checked_out_at).toISOString()).toBe(winner.attendance.checkedOutAt);
    expect(winner.sessionDurationSeconds).toBeGreaterThanOrEqual(0);
    const audits = (await testPool().query('SELECT * FROM attendance_audit_events ORDER BY created_at, id')).rows;
    expect(audits.map((a) => a.action)).toEqual(['attendance.checked_in', 'attendance.checked_out']);
  });

  it('serializes check-in against a timezone change through the same employee lock', async () => {
    const blocker = await testPool().connect();
    let pending: Promise<unknown> | undefined;
    try {
      await blocker.query('BEGIN');
      await blocker.query('SELECT id FROM employees WHERE id = $1 FOR UPDATE', [employeeId]);
      const results = Promise.all([
        request('POST', '/attendance/check-in', employee),
        request('PATCH', `/employees/${employeeId}`, admin, { timezone: NG }),
      ]);
      pending = results;
      // The check-in blocks on withRecordAccess's single-line lock query; the
      // PATCH blocks on authorize's multi-line `... FROM employees\n WHERE id IN`
      // lock — both on the same employee row.
      await waitForBlockedQuery('FROM employees', 2);
      await blocker.query('COMMIT');
      const [checkInResponse, patchResponse] = await results;
      expect(checkInResponse.statusCode).toBe(201);
      const row = (await testPool().query(
        'SELECT work_date::text AS wd, timezone_at_check_in AS tz FROM attendance')).rows[0];
      const actorTz = (await testPool().query('SELECT timezone FROM employees WHERE id = $1', [employeeId])).rows[0].timezone;
      if (patchResponse.statusCode === 200) {
        // Timezone change committed first: the check-in used the new zone.
        expect(row.tz).toBe(NG);
        expect(actorTz).toBe(NG);
      } else {
        // Check-in committed first: the timezone is frozen until checkout.
        expect(patchResponse.statusCode).toBe(409);
        expect(row.tz).toBe(IN);
        expect(actorTz).toBe(IN);
      }
      // work_date always matches the snapshot zone for the stored instant.
      const derived = (await testPool().query(
        'SELECT (checked_in_at AT TIME ZONE timezone_at_check_in)::date::text AS d FROM attendance')).rows[0].d;
      expect(row.wd).toBe(derived);
      expect((await testPool().query('SELECT * FROM attendance_audit_events WHERE action = $1', ['employee.timezone_changed'])).rowCount)
        .toBe(patchResponse.statusCode === 200 ? 1 : 0);
    } finally {
      await blocker.query('ROLLBACK');
      blocker.release();
      await pending;
    }
  });

  it('keeps a forgotten checkout open with no expiry, blocking check-in until an explicit checkout', async () => {
    // A week-old open session: no auto-close, no invented checkout time.
    await seedAttendance(employeeId, { workDate: '2026-01-05', checkedInAt: '2026-01-05T04:30:00Z' });
    const status = await request('GET', '/attendance/status', employee);
    expect(status.json()).toMatchObject({ state: 'checked_in', canCheckIn: false, canCheckOut: true,
      openSession: { workDate: '2026-01-05', checkedOutAt: null }, todayCompletedRecord: null });
    expect((await request('POST', '/attendance/check-in', employee)).statusCode).toBe(409);
    expect((await testPool().query('SELECT checked_out_at FROM attendance WHERE employee_id = $1', [employeeId])).rows[0].checked_out_at).toBeNull();

    // Overnight checkout (days later) is valid and preserves the check-in work date.
    const closed = await request('POST', '/attendance/check-out', employee);
    expect(closed.statusCode).toBe(200);
    expect(closed.json().attendance).toMatchObject({ workDate: '2026-01-05',
      checkedInAt: '2026-01-05T04:30:00.000Z' });
    expect(closed.json().sessionDurationSeconds).toBeGreaterThan(7 * 24 * 3600);
    // todayCompletedRecord only reflects the LOCAL today, not the old record.
    expect((await request('GET', '/attendance/status', employee)).json()).toMatchObject({
      state: 'not_checked_in', openSession: null, todayCompletedRecord: null,
      canCheckIn: true, canCheckOut: false,
    });
  });

  it('reports checked_out only from the current local date after a previous-day record', async () => {
    const before = (await request('GET', '/attendance/status', employee)).json();
    const today = before.localDate as string;
    await seedAttendance(employeeId, { workDate: '2026-01-01', checkedInAt: '2026-01-01T04:30:00Z', checkedOutAt: '2026-01-01T13:00:00Z' });
    await seedAttendance(employeeId, { workDate: today, checkedInAt: '2026-01-05T04:30:00Z', checkedOutAt: '2026-01-05T13:00:00Z' });
    const status = (await request('GET', '/attendance/status', employee)).json();
    expect(status).toMatchObject({ state: 'checked_out', openSession: null,
      todayCompletedRecord: { workDate: today }, canCheckIn: false, canCheckOut: false });
  });

  it('scopes history and company-wide access: own rows only, admin-only list, per-employee local date filters', async () => {
    const at = new Date('2026-01-01T19:00:00Z'); // Kolkata 2026-01-02, Lagos 2026-01-01
    await checkIn(employee.context, { at });
    await checkOut(employee.context, { at: new Date('2026-01-01T20:00:00Z') });
    await checkIn(other.context, { at });

    const mine = await request('GET', '/attendance/me', employee);
    expect(mine.statusCode).toBe(200);
    expect(mine.json().attendance.map((r: { employeeId: string }) => r.employeeId)).toEqual([employeeId]);
    expect(mine.json()).toMatchObject({ limit: 20, offset: 0 });
    const otherHistory = await request('GET', '/attendance/me', other);
    expect(otherHistory.json().attendance.map((r: { employeeId: string }) => r.employeeId)).toEqual([otherId]);
    expect(otherHistory.json().attendance).toHaveLength(1);

    // Company-wide history is admin-only.
    expect((await request('GET', '/attendance', employee)).statusCode).toBe(403);
    expect((await request('GET', '/attendance', other)).statusCode).toBe(403);
    const all = await request('GET', '/attendance', admin);
    expect(all.statusCode).toBe(200);
    expect(all.json().attendance).toHaveLength(2);
    expect((await request('GET', `/attendance?employeeId=${otherId}`, admin)).json().attendance)
      .toHaveLength(1);
    expect((await request('GET', `/attendance?employeeId=${employeeId}`, admin)).json().attendance)
      .toHaveLength(1);
    expect((await request('GET', `/attendance?employeeId=${missingId}`, admin)).json().attendance).toEqual([]);

    // Date filters bind to each record's stored local work_date, not a shared UTC interval.
    expect((await request('GET', '/attendance?fromDate=2026-01-02&toDate=2026-01-02', admin))
      .json().attendance.map((r: { employeeId: string }) => r.employeeId)).toEqual([employeeId]);
    expect((await request('GET', '/attendance?fromDate=2026-01-01&toDate=2026-01-01', admin))
      .json().attendance.map((r: { employeeId: string }) => r.employeeId)).toEqual([otherId]);
    expect((await request('GET', '/attendance/me?fromDate=2026-01-02&toDate=2026-01-02', employee)).json().attendance).toHaveLength(1);
    expect((await request('GET', '/attendance/me?fromDate=2026-01-02', other)).json().attendance).toEqual([]);
  });

  it('bounds pagination and validates every query string with deterministic newest-first order', async () => {
    // Closed rows (the open-session index allows only one open row per employee).
    await testPool().query(
      `INSERT INTO attendance (employee_id, work_date, timezone_at_check_in, checked_in_at, checked_out_at)
       SELECT $1, '2026-01-01'::date + n, $2, '2026-01-01T04:00:00Z'::timestamptz + (n || ' days')::interval,
         '2026-01-01T04:00:00Z'::timestamptz + ((n + 1) || ' days')::interval
       FROM generate_series(0, 24) n`, [employeeId, IN]);
    await seedAttendance(otherId, { workDate: '2026-01-01', checkedInAt: '2026-01-01T04:00:00Z', timezone: NG });

    const first = (await request('GET', '/attendance/me', employee)).json();
    expect(first.limit).toBe(20);
    expect(first.offset).toBe(0);
    expect(first.attendance).toHaveLength(20);
    const rest = (await request('GET', '/attendance/me?offset=20&limit=100', employee)).json();
    expect(rest.attendance).toHaveLength(5);
    expect((await request('GET', '/attendance/me', employee)).json()).toEqual(first);
    const ids = [...first.attendance, ...rest.attendance].map((r: { id: string }) => r.id);
    expect(new Set(ids).size).toBe(25);
    const stamps = [...first.attendance, ...rest.attendance].map((r: { checkedInAt: string }) => r.checkedInAt);
    expect(stamps).toEqual([...stamps].sort().reverse());
    expect(first.attendance.every((r: { employeeId: string }) => r.employeeId === employeeId)).toBe(true);
    expect((await request('GET', '/attendance?employeeId=' + employeeId, admin)).json().attendance).toHaveLength(20);

    // Non-admins are denied /attendance before any query interpretation.
    expect((await request('GET', '/attendance?employeeId=' + otherId, employee)).statusCode).toBe(403);
    for (const query of ['limit=0', 'limit=101', 'limit=1.5', 'offset=-1', 'offset=1000001',
      'fromDate=2025-02-29', 'toDate=not-a-date', 'fromDate=2026-02-01&toDate=2026-01-01',
      'workDate=2026-01-01', 'unknown=x', 'limit=20&limit=30', 'fromDate=%27%20OR%201%3D1--']) {
      expect((await request('GET', `/attendance/me?${query}`, employee)).statusCode, query).toBe(400);
    }
    for (const query of ['limit=0', 'offset=-1', 'employeeId=not-a-uuid', 'unknown=x',
      'fromDate=2026-02-01&toDate=2026-01-01']) {
      expect((await request('GET', `/attendance?${query}`, admin)).statusCode, query).toBe(400);
    }
  });

  it('records transactional audits with attribution and keeps writes atomic on audit failure', async () => {
    await request('POST', '/attendance/check-in', employee);
    await request('POST', '/attendance/check-out', employee);
    const audits = (await testPool().query('SELECT * FROM attendance_audit_events ORDER BY created_at, id')).rows;
    expect(audits.map((a) => a.action)).toEqual(['attendance.checked_in', 'attendance.checked_out']);
    expect(audits.every((a) => a.actor_id === employeeId)).toBe(true);
    expect(audits.every((a) => typeof a.attendance_id === 'string')).toBe(true);
    expect(audits.map((a) => a.changed_fields)).toEqual([['checkedInAt'], ['checkedOutAt']]);
    expect(JSON.stringify(audits)).not.toMatch(/csrf|token|session|google/);

    // A real database failure AFTER the record write proves the atomicity.
    await testPool().query('ALTER TABLE attendance_audit_events ADD CONSTRAINT test_reject_attendance_audit CHECK (false) NOT VALID');
    try {
      const failed = await request('POST', '/attendance/check-in', other);
      expect(failed.statusCode).toBe(500);
      expect(failed.json().message).toBe('Internal server error');
      expect(failed.body).not.toMatch(/INSERT|constraint|23514|Internal detail/);
      // The check-in rolled back with its audit: no record, no orphan event.
      expect((await testPool().query('SELECT * FROM attendance WHERE employee_id = $1', [otherId])).rowCount).toBe(0);
      expect((await testPool().query('SELECT * FROM attendance_audit_events')).rowCount).toBe(2);
    } finally {
      await testPool().query('ALTER TABLE attendance_audit_events DROP CONSTRAINT test_reject_attendance_audit');
    }
    // Recovery: the same employee can check in once the audit path works again.
    expect((await request('POST', '/attendance/check-in', other)).statusCode).toBe(201);
  });

  it('rejects database-level corruption attempts with safe error mapping', async () => {
    // An unknown database failure is never disguised as an auth failure.
    await testPool().query('ALTER TABLE attendance RENAME TO test_hidden_attendance');
    try {
      const response = await request('POST', '/attendance/check-in', employee);
      expect(response.statusCode).toBe(500);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.json().message).toBe('Internal server error');
      expect(response.body).not.toMatch(/42P01|migration|attendance/i);
      expect((await request('GET', '/attendance/status', employee)).statusCode).toBe(500);
    } finally {
      await testPool().query('ALTER TABLE test_hidden_attendance RENAME TO attendance');
    }
    expect((await request('POST', '/attendance/check-in', employee)).statusCode).toBe(201);
  });
});
