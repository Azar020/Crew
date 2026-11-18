import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import type { FastifyInstance } from 'fastify';
import {
  createSession,
  resolveSession,
  revokeSession,
  SESSION_COOKIE_NAME,
} from '../src/modules/auth/service.js';
import { requireRole } from '../src/modules/auth/guards.js';
import type { RequestAuth } from '../src/modules/auth/guards.js';
import { AppError } from '../src/shared/errors.js';
import {
  databaseAvailable,
  resetTables,
  seedEmployee,
  testPool,
  closeTestPool,
} from './helpers/db.js';

/**
 * Session lifecycle and authorization guard tests against the real database:
 * expiry (idle/absolute), revocation, logout, role enforcement, CSRF, and
 * Origin validation.
 */
const dbAvailable = await databaseAvailable();

function authRequestMock(auth: RequestAuth | null): { auth: RequestAuth | null } {
  return { auth };
}

describe.skipIf(!dbAvailable)('Session lifecycle (real database)', () => {
  let app: FastifyInstance;
  let employeeId: string;
  let sessionToken: string;
  let csrfToken: string;

  // Fresh app + fresh seeded employee/session per test. The in-memory
  // rate-limit store is scoped to the app instance, so limits never leak
  // between tests.
  beforeEach(async () => {
    app = await buildApp();
    await resetTables();
    employeeId = await seedEmployee({ email: 'carol@transacty.ai' });
    const created = await createSession(employeeId);
    sessionToken = created.cookieToken;
    csrfToken = created.context.csrfToken;
  });

  afterEach(async () => {
    await app.close();
  });

  afterAll(async () => {
    await closeTestPool();
  });

  it('resolves a valid session with current employee data', async () => {
    const context = await resolveSession(sessionToken);
    expect(context).not.toBeNull();
    expect(context!.employeeId).toBe(employeeId);
    expect(context!.email).toBe('carol@transacty.ai');
    expect(context!.role).toBe('employee');
    expect(context!.csrfToken).toBe(csrfToken);
  });

  it('rejects an unknown token', async () => {
    expect(await resolveSession('totally-unknown-token')).toBeNull();
  });

  it('rejects an idle-expired session', async () => {
    await testPool().query(
      "UPDATE sessions SET idle_expires_at = now() - interval '1 second' WHERE employee_id = $1",
      [employeeId],
    );
    expect(await resolveSession(sessionToken)).toBeNull();
  });

  it('rejects an absolutely-expired session even when the idle window is open', async () => {
    await testPool().query(
      `UPDATE sessions
       SET absolute_expires_at = now() - interval '1 second',
           idle_expires_at = now() + interval '10 minutes'
       WHERE employee_id = $1`,
      [employeeId],
    );
    expect(await resolveSession(sessionToken)).toBeNull();
  });

  it('never lets activity extend the absolute expiry', async () => {
    // Absolute expiry within 1 minute; idle window 30 minutes.
    await testPool().query(
      `UPDATE sessions
       SET absolute_expires_at = now() + interval '1 second',
           idle_expires_at = now() + interval '30 minutes'
       WHERE employee_id = $1`,
      [employeeId],
    );
    // Activity now: idle would be now+30min but must be capped by absolute.
    await resolveSession(sessionToken);
    const row = (
      await testPool().query<{ idle_expires_at: string; absolute_expires_at: string }>(
        'SELECT idle_expires_at, absolute_expires_at FROM sessions WHERE employee_id = $1',
        [employeeId],
      )
    ).rows[0]!;
    expect(new Date(row.idle_expires_at).getTime()).toBeLessThanOrEqual(
      new Date(row.absolute_expires_at).getTime(),
    );
  });

  it('rejects a revoked session and is idempotent on double revocation', async () => {
    const context = await resolveSession(sessionToken);
    expect(context).not.toBeNull();
    await revokeSession(context!.sessionId);
    expect(await resolveSession(sessionToken)).toBeNull();
    // Idempotent.
    await revokeSession(context!.sessionId);
    expect(await resolveSession(sessionToken)).toBeNull();
  });

  it('rejects the session of an employee deactivated after login', async () => {
    await testPool().query(
      'UPDATE employees SET is_active = false WHERE id = $1',
      [employeeId],
    );
    expect(await resolveSession(sessionToken)).toBeNull();
  });

  it('logout via API revokes the session and clears the cookie', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      cookies: { [SESSION_COOKIE_NAME]: sessionToken },
      headers: { 'x-csrf-token': csrfToken },
    });
    expect(response.statusCode).toBe(204);
    const cleared = response.cookies.find((c) => c.name === SESSION_COOKIE_NAME);
    expect(cleared?.value ?? '').toBe('');

    expect(await resolveSession(sessionToken)).toBeNull();
  });

  it('/auth/me returns employee identity and role with no-store', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/auth/me',
      cookies: { [SESSION_COOKIE_NAME]: sessionToken },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    const body = response.json();
    expect(body.employee.email).toBe('carol@transacty.ai');
    expect(body.employee.role).toBe('employee');
  });

  it('/auth/csrf requires authentication', async () => {
    const denied = await app.inject({ method: 'GET', url: '/auth/csrf' });
    expect(denied.statusCode).toBe(401);

    const ok = await app.inject({
      method: 'GET',
      url: '/auth/csrf',
      cookies: { [SESSION_COOKIE_NAME]: sessionToken },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().csrfToken).toBe(csrfToken);
    expect(ok.headers['cache-control']).toBe('no-store');
  });

  it('enforces the admin role guard: employee denied, admin allowed', async () => {
    const employeeContext = (await resolveSession(sessionToken))!;
    const guard = requireRole('admin');

    // Employee -> 403.
    await expect(
      guard(authRequestMock({ ...employeeContext, csrfToken: '' }) as never, {} as never),
    ).rejects.toThrow(new AppError('Insufficient role', 403));

    // Admin -> passes.
    await expect(
      guard(
        authRequestMock({ ...employeeContext, role: 'admin', csrfToken: '' }) as never,
        {} as never,
      ),
    ).resolves.toBeUndefined();
  });

  it('requireAuth returns 401 without or with an invalid cookie', async () => {
    const missing = await app.inject({ method: 'GET', url: '/auth/me' });
    expect(missing.statusCode).toBe(401);

    const invalid = await app.inject({
      method: 'GET',
      url: '/auth/me',
      cookies: { [SESSION_COOKIE_NAME]: 'forged-token-value' },
    });
    expect(invalid.statusCode).toBe(401);
  });

  it('rejects state-changing requests with missing or invalid CSRF (403)', async () => {
    const missing = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      cookies: { [SESSION_COOKIE_NAME]: sessionToken },
    });
    expect(missing.statusCode).toBe(403);

    const invalid = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      cookies: { [SESSION_COOKIE_NAME]: sessionToken },
      headers: { 'x-csrf-token': 'wrong-token' },
    });
    expect(invalid.statusCode).toBe(403);

    // The session must still be alive after failed CSRF attempts.
    expect(await resolveSession(sessionToken)).not.toBeNull();
  });

  it('rejects unapproved Origin headers (403) and accepts approved ones', async () => {
    const evil = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      cookies: { [SESSION_COOKIE_NAME]: sessionToken },
      headers: {
        'x-csrf-token': csrfToken,
        origin: 'http://evil.example',
      },
    });
    expect(evil.statusCode).toBe(403);

    // Near-miss: same host, different port.
    const nearMiss = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      cookies: { [SESSION_COOKIE_NAME]: sessionToken },
      headers: {
        'x-csrf-token': csrfToken,
        origin: 'http://127.0.0.1:3001',
      },
    });
    expect(nearMiss.statusCode).toBe(403);

    // Exact approved origin: logout succeeds.
    const approved = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      cookies: { [SESSION_COOKIE_NAME]: sessionToken },
      headers: {
        'x-csrf-token': csrfToken,
        origin: 'http://127.0.0.1:3000',
      },
    });
    expect(approved.statusCode).toBe(204);
  });
});
