import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { createSession, resolveSession, type CreatedSession } from '../src/modules/auth/service.js';
import { changeEmployeeRole, updateEmployee, updateSelfProfile } from '../src/modules/employees/service.js';
import { databaseAvailable, resetTables, seedEmployee, testPool, closeTestPool } from './helpers/db.js';
import { waitForBlockedQuery } from './helpers/locks.js';

const available = await databaseAvailable();
const safeKeys = ['id', 'name', 'email', 'role', 'isActive', 'timezone', 'identityBound', 'createdAt', 'updatedAt'].sort();
const missingId = '11111111-1111-4111-8111-111111111111';

describe.skipIf(!available)('employee management (real PostgreSQL)', () => {
  let app: FastifyInstance;
  let admin: CreatedSession;
  let employee: CreatedSession;
  let adminId: string;
  let employeeId: string;

  beforeEach(async () => {
    await resetTables();
    app = await buildApp();
    adminId = await seedEmployee({ email: 'admin@transacty.ai', role: 'admin', name: 'Admin' });
    employeeId = await seedEmployee({ email: 'alice@transacty.ai', name: 'Alice', googleSub: 'private-google-sub' });
    admin = await createSession(adminId);
    employee = await createSession(employeeId);
  });
  afterEach(async () => { await app.close(); });
  afterAll(closeTestPool);

  function request(method: 'GET' | 'POST' | 'PATCH', url: string, session?: CreatedSession, body?: object,
    headers?: Record<string, string>) {
    return app.inject({
      method, url,
      ...(session ? { cookies: { teamdesk_session: session.cookieToken } } : {}),
      ...(body ? { payload: body } : {}),
      headers: headers ?? (session ? { 'x-csrf-token': session.context.csrfToken } : {}),
    });
  }
  async function row(id = employeeId) {
    return (await testPool().query('SELECT * FROM employees WHERE id = $1', [id])).rows[0];
  }

  it('requires authentication on every endpoint and denies employees every admin operation', async () => {
    const endpoints = [
      ['GET', '/employees/me', undefined], ['PATCH', '/employees/me', { name: 'New' }],
      ['GET', '/employees', undefined], ['GET', `/employees/${employeeId}`, undefined],
      ['POST', '/employees', { name: 'New', email: 'new@transacty.ai', timezone: 'Asia/Kolkata' }],
      ['PATCH', `/employees/${employeeId}`, { name: 'New' }],
      ['PATCH', `/employees/${employeeId}/role`, { role: 'admin' }],
    ] as const;
    for (const [method, url, payload] of endpoints) {
      const response = await request(method, url, undefined, payload);
      expect(response.statusCode, url).toBe(401);
      expect(response.headers['cache-control']).toBe('no-store');
    }
    for (const [method, url, payload] of endpoints.slice(2)) {
      expect((await request(method, url, employee, payload)).statusCode, url).toBe(403);
    }
    const invalid = await app.inject({ url: '/employees/me', cookies: { teamdesk_session: 'invalid' } });
    expect(invalid.statusCode).toBe(401);
    await testPool().query('UPDATE employees SET is_active = false WHERE id = $1', [employeeId]);
    expect((await request('GET', '/employees/me', employee)).statusCode).toBe(401);
    expect((await request('PATCH', '/employees/me', employee, { name: 'Inactive' })).statusCode).toBe(401);
  });

  it('returns only the caller safe profile without requiring GET CSRF', async () => {
    const result = await request('GET', '/employees/me', employee, undefined, {});
    expect(result.statusCode).toBe(200);
    expect(result.headers['cache-control']).toBe('no-store');
    expect(Object.keys(result.json().employee).sort()).toEqual(safeKeys);
    expect(result.json().employee).toMatchObject({ id: employeeId, name: 'Alice', identityBound: true });
    expect(result.body).not.toMatch(/private-google-sub|csrf|token|session|google_sub/);
    expect((await request('GET', `/employees/me?id=${adminId}`, employee)).json().employee.id).toBe(employeeId);
  });

  it('updates only own name, trims it, preserves omitted/security fields and sessions, and reads it back', async () => {
    const before = await row();
    const result = await request('PATCH', '/employees/me', employee, { name: '  Alice Updated  ' });
    expect(result.statusCode).toBe(200);
    expect(result.json().employee).toMatchObject({ id: employeeId, name: 'Alice Updated' });
    expect(Object.keys(result.json().employee).sort()).toEqual(safeKeys);
    const after = await row();
    for (const field of ['id', 'email', 'role', 'is_active', 'google_sub', 'created_at']) {
      expect(after[field]).toEqual(before[field]);
    }
    expect((await row(adminId)).name).toBe('Admin');
    expect(await resolveSession(employee.cookieToken)).not.toBeNull();
    expect((await request('GET', '/employees/me', employee)).json().employee.name).toBe('Alice Updated');
    expect((await request('PATCH', '/employees/me', employee, { name: 'x'.repeat(200) })).statusCode).toBe(200);
    const queryId = await request('PATCH', `/employees/me?employeeId=${adminId}`, employee, { name: 'Still Alice' });
    expect(queryId.json().employee.id).toBe(employeeId);
    expect((await row(adminId)).name).toBe('Admin');
  });

  it('supports admin self-service without changing another profile', async () => {
    const result = await request('PATCH', '/employees/me', admin, { name: 'Admin Updated' });
    expect(result.statusCode).toBe(200);
    expect(result.json().employee.id).toBe(adminId);
    expect((await row()).name).toBe('Alice');
    expect((await request('GET', '/employees/me', admin)).json().employee.name).toBe('Admin Updated');
  });

  it('rejects forbidden/unknown/mixed self-service payloads atomically', async () => {
    const forbidden = {
      id: adminId, employeeId: adminId, actorId: adminId, email: 'other@transacty.ai', role: 'admin',
      isActive: false, is_active: false, google_sub: null, googleSub: 'new-sub', identityBound: false,
      managerId: adminId, department: 'IT', designation: 'Director', joiningDate: '2026-01-01',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      sessionId: admin.context.sessionId, csrfToken: 'anything', phone: '123', unknown: true,
    };
    const before = await row();
    for (const [key, value] of Object.entries(forbidden)) {
      expect((await request('PATCH', '/employees/me', employee, { [key]: value })).statusCode, key).toBe(400);
      expect((await request('PATCH', '/employees/me', employee, { name: 'Changed', [key]: value })).statusCode, key).toBe(400);
    }
    for (const payload of [{}, { name: '' }, { name: ' \t\n' }, { name: null }, { name: 4 }, { name: 'x'.repeat(201) }]) {
      expect((await request('PATCH', '/employees/me', employee, payload)).statusCode).toBe(400);
    }
    expect(await row()).toEqual(before);
    expect((await testPool().query('SELECT * FROM employee_audit_events')).rowCount).toBe(0);
  });

  it('applies CSRF and exact-Origin protection to every mutation', async () => {
    const mutations = [
      ['/employees/me', { name: 'New' }, 'PATCH'],
      ['/employees', { name: 'New', email: 'new@transacty.ai', timezone: 'Asia/Kolkata' }, 'POST'],
      [`/employees/${employeeId}`, { name: 'New' }, 'PATCH'],
      [`/employees/${employeeId}/role`, { role: 'admin' }, 'PATCH'],
    ] as const;
    for (const [url, payload, method] of mutations) {
      for (const headers of [{}, { 'x-csrf-token': 'wrong' },
        { 'x-csrf-token': admin.context.csrfToken, origin: 'http://127.0.0.1:3001' },
        { 'x-csrf-token': admin.context.csrfToken, origin: 'http://127.0.0.1:3000.evil.test' }]) {
        const response = await request(method, url, admin, payload, headers);
        expect(response.statusCode, url).toBe(403);
        expect(response.headers['cache-control']).toBe('no-store');
      }
    }
    expect((await request('PATCH', '/employees/me', employee, { name: 'Approved' }, {
      'x-csrf-token': employee.context.csrfToken, origin: 'http://127.0.0.1:3000',
    })).statusCode).toBe(200);
  });

  it('provisions normalized company emails with employee role and unbound identity', async () => {
    for (const [email, normalized] of [
      ['  New.User@TRANSACTY.AI  ', 'new.user@transacty.ai'],
      ['  Ops@N23DIGITALS.COM ', 'ops@n23digitals.com'],
    ]) {
      const result = await request('POST', '/employees', admin, { name: ' New User ', email, timezone: 'Asia/Kolkata' });
      expect(result.statusCode).toBe(201);
      expect(result.json().employee).toMatchObject({ name: 'New User', email: normalized,
        role: 'employee', isActive: true, identityBound: false, timezone: 'Asia/Kolkata' });
      expect(Object.keys(result.json().employee).sort()).toEqual(safeKeys);
      expect((await row(result.json().employee.id)).google_sub).toBeNull();
    }
  });

  it('rejects malformed, external, subdomain, suffix and lookalike emails', async () => {
    for (const email of ['x@gmail.com', 'x@sub.transacty.ai', 'x@eviltransacty.ai', 'x@transacty.ai.evil.com',
      'x@n23digitals.com.evil.com', 'x@sub.n23digitals.com', 'x@@transacty.ai', 'a b@transacty.ai',
      'missing-at', '@transacty.ai', 'a..b@transacty.ai', 'x@transacty.ai.', 'a'.repeat(255) + '@transacty.ai']) {
      expect((await request('POST', '/employees', admin, { name: 'Test', email, timezone: 'Asia/Kolkata' })).statusCode, email).toBe(400);
    }
    for (const extra of [{ role: 'admin' }, { isActive: false }, { google_sub: 'sub' }, { id: missingId },
      { sessionId: admin.context.sessionId }, { unknown: true }, { timezone: 'Not/AZone' }, { timezone: '+05:30' }]) {
      expect((await request('POST', '/employees', admin,
        { name: 'Test', email: 'test@transacty.ai', ...extra })).statusCode).toBe(400);
    }
  });

  it('handles normalized and concurrent uniqueness conflicts, with database constraints', async () => {
    const secondAdminId = await seedEmployee({ email: 'admin2@transacty.ai', role: 'admin' });
    const secondAdmin = await createSession(secondAdminId);
    const results = await Promise.all([
      request('POST', '/employees', admin, { name: 'One', email: ' DUP@TRANSACTY.AI ', timezone: 'Asia/Kolkata' }),
      request('POST', '/employees', secondAdmin, { name: 'Two', email: 'dup@transacty.ai', timezone: 'Asia/Kolkata' }),
    ]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([201, 409]);
    expect((await request('POST', '/employees', admin, { name: 'Dup', email: 'ALICE@TRANSACTY.AI', timezone: 'Asia/Kolkata' })).statusCode).toBe(409);
    const unbound = await seedEmployee({ email: 'unbound@transacty.ai' });
    expect((await request('PATCH', `/employees/${unbound}`, admin, { email: ' ALICE@transacty.ai ' })).statusCode).toBe(409);
    const pool = testPool();
    const insert = (email: string) => pool.query(
      "INSERT INTO employees (name, email, role) VALUES ('Direct', $1, 'employee')", [email]);
    await expect(insert('alice@transacty.ai')).rejects.toMatchObject({ code: '23505' });
    await expect(insert('Alice@transacty.ai')).rejects.toMatchObject({ code: '23514' });
    await expect(insert(' alice@transacty.ai ')).rejects.toMatchObject({ code: '23514' });
    await expect(insert('\talice@transacty.ai\n')).rejects.toMatchObject({ code: '23514' });
    // Independent writers also contend on the real unique index, not only the API lock.
    const direct = await Promise.allSettled([insert('race@transacty.ai'), insert('race@transacty.ai')]);
    expect(direct.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(direct.find((r) => r.status === 'rejected')).toMatchObject({ reason: { code: '23505' } });
  });

  it('allows unbound email updates but rejects bound changes and privileged/empty admin patches', async () => {
    const unbound = await seedEmployee({ email: 'unbound@transacty.ai' });
    const result = await request('PATCH', `/employees/${unbound}`, admin,
      { name: ' New Name ', email: ' Changed@N23DIGITALS.COM ' });
    expect(result.statusCode).toBe(200);
    expect(result.json().employee).toMatchObject({ name: 'New Name', email: 'changed@n23digitals.com', identityBound: false });
    expect((await row(unbound)).role).toBe('employee');
    expect((await request('PATCH', `/employees/${employeeId}`, admin,
      { name: 'Must Roll Back', email: 'new@transacty.ai' })).statusCode).toBe(409);
    expect((await row()).name).toBe('Alice');
    for (const patch of [{}, { role: 'admin' }, { googleSub: null }, { name: ' ' },
      { name: 'x'.repeat(201) }, { isActive: 'false' }, { email: 'bad@example.com' }, { name: 'New', unknown: 1 },
      { timezone: 'Not/AZone' }, { timezone: '+05:30' }, { timezone: 5 }]) {
      expect((await request('PATCH', `/employees/${employeeId}`, admin, patch)).statusCode).toBe(400);
    }
    expect((await request('PATCH', `/employees/${employeeId}`, admin, { name: 'Admin Edit' })).statusCode).toBe(200);
    expect(await resolveSession(employee.cookieToken)).not.toBeNull();
  });

  it('lists with bounded pagination, deterministic order, literal search, filters and safe fields', async () => {
    for (let i = 0; i < 23; i++) await seedEmployee({ email: `person${i}@n23digitals.com`, name: `Person ${i}` });
    const inactive = await seedEmployee({ email: 'inactive@transacty.ai', isActive: false, name: '100%_Literal' });
    const first = await request('GET', '/employees', admin, undefined, {});
    expect(first.statusCode).toBe(200);
    expect(first.json().employees).toHaveLength(20);
    expect(first.json().limit).toBe(20);
    expect((await request('GET', '/employees', admin)).json()).toEqual(first.json());
    const second = (await request('GET', '/employees?offset=20&limit=100', admin)).json();
    expect(second.employees).toHaveLength(6);
    const ids = [...first.json().employees, ...second.employees].map((e) => e.id);
    expect(new Set(ids).size).toBe(26);
    for (const item of first.json().employees) expect(Object.keys(item).sort()).toEqual(safeKeys);
    expect(first.body).not.toMatch(/private-google-sub|csrf|token|session/);
    const filtered = await request('GET', '/employees?role=employee&isActive=false&search=100%25_', admin);
    expect(filtered.json().employees.map((e: { id: string }) => e.id)).toEqual([inactive]);
    expect((await request('GET', '/employees?search=N23DIGITALS.COM', admin)).json().employees).toHaveLength(20);
    expect((await request('GET', '/employees?search=%27%20OR%201%3D1--', admin)).json().employees).toEqual([]);
    for (const query of ['limit=101', 'limit=0', 'limit=1.5', 'offset=-1', 'offset=1000001', 'role=manager',
      'isActive=1', 'isActive=', 'unknown=1', 'search=', `search=${'x'.repeat(101)}`]) {
      expect((await request('GET', `/employees?${query}`, admin)).statusCode, query).toBe(400);
    }
  });

  it('returns consistent 404s and rejects malformed IDs', async () => {
    for (const [method, suffix, payload] of [['GET', '', undefined], ['PATCH', '', { name: 'New' }],
      ['PATCH', '/role', { role: 'admin' }]] as const) {
      const response = await request(method, `/employees/${missingId}${suffix}`, admin, payload);
      expect(response.statusCode).toBe(404);
      expect(response.json().message).toBe('Employee not found');
      expect((await request(method, `/employees/not-a-uuid${suffix}`, admin, payload)).statusCode).toBe(400);
    }
    expect((await app.inject({ method: 'DELETE', url: `/employees/${employeeId}` })).statusCode).toBe(404);
    expect((await request('POST', `/employees/${employeeId}/reset-identity`, admin, {})).statusCode).toBe(404);
  });

  it('explicitly promotes/demotes, revokes all target sessions and validates role payloads', async () => {
    const extra = await createSession(employeeId);
    for (const body of [{ role: 'manager' }, { role: null }, {}, { role: 'admin', name: 'No' }]) {
      expect((await request('PATCH', `/employees/${employeeId}/role`, admin, body)).statusCode).toBe(400);
    }
    expect((await request('PATCH', `/employees/${employeeId}/role`, admin, { role: 'admin' })).json().employee.role).toBe('admin');
    expect(await resolveSession(employee.cookieToken)).toBeNull();
    expect(await resolveSession(extra.cookieToken)).toBeNull();
    const promoted = await createSession(employeeId);
    expect((await request('GET', '/employees', promoted)).statusCode).toBe(200);
    expect((await request('PATCH', `/employees/${employeeId}/role`, admin, { role: 'employee' })).statusCode).toBe(200);
    expect(await resolveSession(promoted.cookieToken)).toBeNull();
    expect((await row()).google_sub).toBe('private-google-sub');
  });

  it('blocks self-deactivation and last-admin demotion, permits self-demotion with another active admin', async () => {
    expect((await request('PATCH', `/employees/${adminId}`, admin, { isActive: false })).statusCode).toBe(409);
    expect((await request('PATCH', `/employees/${adminId}/role`, admin, { role: 'employee' })).statusCode).toBe(409);
    await seedEmployee({ email: 'inactive-admin@transacty.ai', role: 'admin', isActive: false });
    expect((await request('PATCH', `/employees/${adminId}/role`, admin, { role: 'employee' })).statusCode).toBe(409);
    await seedEmployee({ email: 'active-admin@transacty.ai', role: 'admin' });
    expect((await request('PATCH', `/employees/${adminId}/role`, admin, { role: 'employee' })).statusCode).toBe(200);
    expect(await resolveSession(admin.cookieToken)).toBeNull();
  });

  it('deactivation revokes every session; reactivation never revives them', async () => {
    const extra = await createSession(employeeId);
    expect((await request('PATCH', `/employees/${employeeId}`, admin, { isActive: false })).statusCode).toBe(200);
    expect(await resolveSession(employee.cookieToken)).toBeNull();
    expect(await resolveSession(extra.cookieToken)).toBeNull();
    expect((await request('PATCH', `/employees/${employeeId}`, admin, { isActive: true })).statusCode).toBe(200);
    expect(await resolveSession(employee.cookieToken)).toBeNull();
    expect(await resolveSession(extra.cookieToken)).toBeNull();
    expect((await row()).google_sub).toBe('private-google-sub');
    expect(await resolveSession((await createSession(employeeId)).cookieToken)).not.toBeNull();
  });

  it('serializes competing self-demotions so one active admin survives', async () => {
    const id = await seedEmployee({ email: 'admin2@transacty.ai', role: 'admin' });
    const other = await createSession(id);
    const blocker = await testPool().connect();
    let pending: Promise<unknown> | undefined;
    try {
      await blocker.query('BEGIN');
      await blocker.query("SELECT pg_advisory_xact_lock(hashtext('transacty:bootstrap:admin'))");
      const results = Promise.all([
        request('PATCH', `/employees/${adminId}/role`, admin, { role: 'employee' }),
        request('PATCH', `/employees/${id}/role`, other, { role: 'employee' }),
      ]);
      pending = results;
      await waitForBlockedQuery('pg_advisory_xact_lock', 2);
      await blocker.query('COMMIT');
      expect((await results).map((r) => r.statusCode).sort()).toEqual([200, 409]);
      expect((await testPool().query("SELECT id FROM employees WHERE role='admin' AND is_active")).rowCount).toBe(1);
    } finally {
      await blocker.query('ROLLBACK');
      blocker.release();
      await pending;
    }
  });

  it('serializes competing deactivations and rechecks the losing actor session', async () => {
    const id = await seedEmployee({ email: 'admin2@transacty.ai', role: 'admin' });
    const other = await createSession(id);
    const result = await Promise.all([
      request('PATCH', `/employees/${id}`, admin, { isActive: false }),
      request('PATCH', `/employees/${adminId}`, other, { isActive: false }),
    ]);
    expect(result.map((r) => r.statusCode).sort()).toEqual([200, 401]);
    expect((await testPool().query("SELECT id FROM employees WHERE role='admin' AND is_active")).rowCount).toBe(1);
  });

  it('serializes mixed demotion/deactivation and rejects stale admin contexts', async () => {
    const id = await seedEmployee({ email: 'admin2@transacty.ai', role: 'admin' });
    const other = await createSession(id);
    const results = await Promise.all([
      request('PATCH', `/employees/${adminId}/role`, admin, { role: 'employee' }),
      request('PATCH', `/employees/${adminId}`, other, { isActive: false }),
    ]);
    expect(results.every((r) => [200, 401].includes(r.statusCode))).toBe(true);
    expect((await row(id)).is_active).toBe(true);
    await expect(changeEmployeeRole(admin.context, employeeId, 'admin')).rejects.toMatchObject({ statusCode: 401 });
    await expect(updateEmployee(admin.context, employeeId, { isActive: false })).rejects.toMatchObject({ statusCode: 401 });
  });

  it('rechecks a profile update after waiting behind concurrent deactivation', async () => {
    const blocker = await testPool().connect();
    let pending: Promise<unknown> | undefined;
    try {
      await blocker.query('BEGIN');
      await blocker.query('UPDATE employees SET is_active = false WHERE id = $1', [employeeId]);
      pending = updateSelfProfile(employee.context, { name: 'Must not apply' });
      const assertion = expect(pending).rejects.toMatchObject({ statusCode: 401 });
      await waitForBlockedQuery('ORDER BY id FOR UPDATE');
      await blocker.query('UPDATE sessions SET revoked_at = now() WHERE employee_id = $1', [employeeId]);
      await blocker.query('COMMIT');
      await assertion;
      expect((await row()).name).toBe('Alice');
      expect((await row()).is_active).toBe(false);
    } finally {
      await blocker.query('ROLLBACK');
      blocker.release();
      await pending?.catch(() => {});
    }
  });

  it('uses current role and session validity inside sensitive transactions', async () => {
    await testPool().query("UPDATE employees SET role = 'employee' WHERE id = $1", [adminId]);
    await expect(updateEmployee(admin.context, employeeId, { isActive: false }))
      .rejects.toMatchObject({ statusCode: 403 });
    await expect(changeEmployeeRole(admin.context, employeeId, 'admin'))
      .rejects.toMatchObject({ statusCode: 403 });
    await testPool().query("UPDATE sessions SET absolute_expires_at = now() - interval '1 second' WHERE id = $1",
      [employee.context.sessionId]);
    await expect(updateSelfProfile(employee.context, { name: 'Expired' }))
      .rejects.toMatchObject({ statusCode: 401 });
    expect((await row()).name).toBe('Alice');
  });

  it('handles a missing audit migration with safe diagnostics, rollback, and recovery', async () => {
    // Reproduce the development failure only in the isolated test database.
    await testPool().query('ALTER TABLE employee_audit_events RENAME TO test_hidden_employee_audit_events');
    try {
      const response = await request('PATCH', '/employees/me', employee, { name: 'Private Failed Name' });
      expect(response.statusCode).toBe(500);
      expect(response.json()).toEqual({ statusCode: 500, error: 'Internal Server Error', message: 'Internal server error' });
      expect(response.headers['cache-control']).toBe('no-store');
      expect((await row()).name).toBe('Alice');
      expect(await resolveSession(employee.cookieToken)).not.toBeNull();

      const created = await request('POST', '/employees', admin,
        { name: 'Private Failed Provision', email: 'failed@transacty.ai', timezone: 'Asia/Kolkata' });
      expect(created.statusCode).toBe(500);
      expect((await testPool().query("SELECT id FROM employees WHERE email = 'failed@transacty.ai'")).rowCount).toBe(0);

      const failure = await updateSelfProfile(employee.context, { name: 'Private Failed Name' })
        .then(() => { throw new Error('Expected missing-table failure'); }, (error: unknown) => error);
      expect(failure).toMatchObject({ name: 'EmployeeDatabaseError', databaseCode: '42P01' });
      expect((failure as Error).message).toContain('pending migrations');
      expect((failure as Error).cause).toBeUndefined();
      expect(JSON.stringify(failure) + String(failure)).not.toMatch(/Private Failed Name|INSERT|private-google-sub|token|params/);
      expect(response.body).not.toMatch(/42P01|migration|employee_audit_events|Private Failed Name/);
    } finally {
      await testPool().query('ALTER TABLE test_hidden_employee_audit_events RENAME TO employee_audit_events');
    }
    const recovered = await request('PATCH', '/employees/me', employee, { name: 'Recovered Name' });
    expect(recovered.statusCode).toBe(200);
    expect(recovered.json().employee.name).toBe('Recovered Name');
    expect((await testPool().query('SELECT * FROM employee_audit_events')).rowCount).toBe(1);
  });

  it('rolls back employee changes and revocation if persistent auditing fails', async () => {
    // A real database failure after the employee/session writes proves atomicity.
    await testPool().query('ALTER TABLE employee_audit_events ADD CONSTRAINT test_reject_audit CHECK (false)');
    try {
      for (const [url, payload] of [
        ['/employees/me', { name: 'Never committed' }],
        [`/employees/${employeeId}/role`, { role: 'admin' }],
        [`/employees/${employeeId}`, { isActive: false }],
      ] as const) {
        const result = await request('PATCH', url, admin, payload);
        expect(result.statusCode).toBe(500);
        expect(result.body).not.toMatch(/Never committed|INSERT|constraint|private-google-sub/);
      }
      expect((await row(adminId)).name).toBe('Admin');
      expect((await row()).role).toBe('employee');
      expect((await row()).is_active).toBe(true);
      expect(await resolveSession(employee.cookieToken)).not.toBeNull();
      expect((await testPool().query('SELECT * FROM employee_audit_events')).rowCount).toBe(0);
    } finally {
      await testPool().query('ALTER TABLE employee_audit_events DROP CONSTRAINT test_reject_audit');
    }
  });

  it('records transactional audits with attribution and access values but no personal values', async () => {
    const created = await request('POST', '/employees', admin, { name: 'Secret Name', email: 'secret@transacty.ai', timezone: 'Asia/Kolkata' });
    const id = created.json().employee.id;
    await request('PATCH', '/employees/me', employee, { name: 'Private Name' });
    await request('PATCH', `/employees/${id}`, admin, { email: 'changed@transacty.ai' });
    await request('PATCH', `/employees/${id}/role`, admin, { role: 'admin' });
    await request('PATCH', `/employees/${id}`, admin, { isActive: false });
    await request('PATCH', `/employees/${id}`, admin, { isActive: true });
    const events = (await testPool().query('SELECT * FROM employee_audit_events ORDER BY created_at, id')).rows;
    expect(events.map((e) => e.action)).toEqual(['employee.created', 'employee.profile_updated',
      'employee.email_changed', 'employee.role_changed', 'employee.deactivated', 'employee.reactivated']);
    for (const event of events) {
      expect(event.actor_id).toBe(event.action === 'employee.profile_updated' ? employeeId : adminId);
      expect(event.target_id).toBe(event.action === 'employee.profile_updated' ? employeeId : id);
      expect(event.created_at).toBeInstanceOf(Date);
      expect(event.changed_fields.length).toBeGreaterThan(0);
    }
    expect(events[1]).toMatchObject({ before: null, after: null, changed_fields: ['name'] });
    expect(events[2]).toMatchObject({ before: null, after: null, changed_fields: ['email'] });
    expect(events[3]).toMatchObject({ before: { role: 'employee' }, after: { role: 'admin' } });
    expect(events[4]).toMatchObject({ before: { isActive: true }, after: { isActive: false } });
    expect(JSON.stringify(events)).not.toMatch(/Secret Name|Private Name|secret@|changed@|private-google-sub|csrf|token/);
    // A rejected mixed patch cannot leave either a profile change or audit behind.
    await request('PATCH', `/employees/${employeeId}`, admin, { name: 'No', email: 'bound@transacty.ai' });
    expect((await testPool().query('SELECT * FROM employee_audit_events')).rowCount).toBe(events.length);
    // No-op name changes neither revoke sessions nor create misleading audit events.
    await request('PATCH', '/employees/me', employee, { name: 'Private Name' });
    expect((await testPool().query('SELECT * FROM employee_audit_events')).rowCount).toBe(events.length);
  });

  it('manages work timezones: required at provisioning, admin-only, audited, blocked while attendance is open', async () => {
    const pool = testPool();
    // Timezone is mandatory at provisioning and must be a supported IANA name.
    expect((await request('POST', '/employees', admin, { name: 'NoTz', email: 'notz@transacty.ai' })).statusCode).toBe(400);
    expect((await request('POST', '/employees', admin,
      { name: 'BadTz', email: 'badtz@transacty.ai', timezone: 'Not/AZone' })).statusCode).toBe(400);
    expect((await request('POST', '/employees', admin,
      { name: 'OffTz', email: 'offtz@transacty.ai', timezone: '+05:30' })).statusCode).toBe(400);
    expect((await request('POST', '/employees', admin,
      { name: 'AbbTz', email: 'abbtz@transacty.ai', timezone: 'IST' })).statusCode).toBe(400);
    // Pre-timezone employees keep timezone null, surfaced safely in the profile.
    expect((await request('GET', '/employees/me', employee)).json().employee.timezone).toBeNull();
    // Self-service never accepts timezone changes.
    expect((await request('PATCH', '/employees/me', employee,
      { name: 'Alice', timezone: 'Asia/Kolkata' })).statusCode).toBe(400);
    // Admin change works, appears in the profile, and is audited with before/after.
    const changed = await request('PATCH', `/employees/${employeeId}`, admin, { timezone: 'Africa/Lagos' });
    expect(changed.statusCode).toBe(200);
    expect(changed.json().employee.timezone).toBe('Africa/Lagos');
    const audit = (await pool.query(
      "SELECT * FROM employee_audit_events WHERE action = 'employee.timezone_changed'")).rows;
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actor_id: adminId, target_id: employeeId,
      changed_fields: ['timezone'], before: { timezone: null }, after: { timezone: 'Africa/Lagos' } });
    // A change is audited exactly once; same-value patches do not audit again.
    await request('PATCH', `/employees/${employeeId}`, admin, { timezone: 'Africa/Lagos' });
    expect((await pool.query(
      "SELECT * FROM employee_audit_events WHERE action = 'employee.timezone_changed'")).rowCount).toBe(1);
    // While an attendance session is open the timezone is frozen.
    await pool.query(
      "INSERT INTO attendance (employee_id, work_date, timezone_at_check_in, checked_in_at) VALUES ($1, '2026-01-01', 'Africa/Lagos', now())",
      [employeeId]);
    const blocked = await request('PATCH', `/employees/${employeeId}`, admin, { timezone: 'Asia/Kolkata' });
    expect(blocked.statusCode).toBe(409);
    expect((await row()).timezone).toBe('Africa/Lagos');
    expect((await pool.query(
      "SELECT * FROM employee_audit_events WHERE action = 'employee.timezone_changed'")).rowCount).toBe(1);
  });
});
