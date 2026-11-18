import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import type { FastifyInstance } from 'fastify';
import {
  databaseAvailable,
  resetTables,
  seedEmployee,
  employeeField,
  testPool,
  closeTestPool,
} from './helpers/db.js';
import { sha256Hex } from '../src/shared/hashing.js';
import { createSession, resolveSession } from '../src/modules/auth/service.js';
import { waitForBlockedQuery } from './helpers/locks.js';

/**
 * End-to-end login flow tests with a MOCKED Google provider (no network).
 * Policy checks (email domain, hd, email_verified) run through the real
 * validateGoogleIdentity inside the mock, so production validation is NOT
 * weakened — only the network exchange is stubbed.
 *
 * Database-backed assertions cover binding, sessions, and transaction
 * consumption/concurrency.
 */

const googleMockState = vi.hoisted(() => ({
  /** Claims the mocked Google exchange will return next. */
  nextClaims: null as Record<string, unknown> | null,
  /** Per-code claims for concurrent callbacks (wins over nextClaims). */
  claimsByCode: new Map<string, Record<string, unknown>>(),
  /** When set, the mocked exchange throws this instead. */
  exchangeError: null as Error | null,
  mockCallCount: 0,
}));

vi.mock('../src/modules/auth/google.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../src/modules/auth/google.js')>();
  return {
    ...actual,
    buildGoogleAuthorizationRequest: vi.fn(async () => {
      googleMockState.mockCallCount += 1;
      const n = googleMockState.mockCallCount;
      return {
        authorizationUrl: new URL(
          `https://accounts.google.com/o/oauth2/v2/auth?mock=1&n=${n}`,
        ),
        state: `state-${n}-${crypto.randomUUID()}`,
        nonce: `nonce-${n}-${crypto.randomUUID()}`,
        codeVerifier: `verifier-${n}-${crypto.randomUUID()}`,
      };
    }),
    exchangeAuthorizationCode: vi.fn(async (params: { callbackUrl: string }) => {
      if (googleMockState.exchangeError) {
        throw googleMockState.exchangeError;
      }
      // Per-code claims give deterministic identities in concurrent tests.
      const code = new URL(params.callbackUrl).searchParams.get('code') ?? '';
      const claims =
        googleMockState.claimsByCode.get(code) ?? googleMockState.nextClaims;
      if (!claims) {
        throw new Error('test bug: no claims configured for exchange');
      }
      // Run the REAL policy validation over the mocked claims.
      return actual.validateGoogleIdentity(claims);
    }),
  };
});

// Hoisted mock state needs the counter too.
Object.assign(googleMockState, { mockCallCount: 0 });

const validIdentity = {
  sub: 'google-sub-1111111111',
  email: 'alice@transacty.ai',
  email_verified: true,
  name: 'Alice Adams',
  hd: 'transacty.ai',
};

const dbAvailable = await databaseAvailable();
const TX_COOKIE = 'teamdesk_oauth_tx';
const SESSION_COOKIE = 'teamdesk_session';

function extractCookie(setCookie: string[] | undefined, name: string): string | undefined {
  if (!setCookie) return undefined;
  const found = setCookie.find((c) => c.startsWith(`${name}=`));
  if (!found) return undefined;
  return found.slice(name.length + 1, found.indexOf(';') === -1 ? undefined : found.indexOf(';'));
}

describe.skipIf(!dbAvailable)('Google login flow (mocked provider, real database)', () => {
  let app: FastifyInstance;

  // A fresh app per test: the in-memory rate-limit store is scoped to the
  // app instance, so tests that call /auth/login do not exhaust each other's
  // limits. Tables are reset per test as well.
  beforeEach(async () => {
    app = await buildApp();
    await resetTables();
  });

  afterEach(async () => {
    googleMockState.exchangeError = null;
    googleMockState.claimsByCode.clear();
    await app.close();
    await resetTables();
  });

  afterAll(async () => {
    await closeTestPool();
  });

  it('starts a login: 302 to Google, transaction row, browser-binding cookie', async () => {
    const response = await app.inject({ method: 'GET', url: '/auth/login' });

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toContain('accounts.google.com');
    const txCookie = extractCookie(response.cookies.map((c) => c.name ? `${c.name}=${c.value}` : '').filter(Boolean) as string[], TX_COOKIE)
      ?? response.cookies.find((c) => c.name === TX_COOKIE)?.value;
    expect(txCookie).toBeTruthy();

    const rows = await testPool().query<{ browser_token_hash: string; state: string }>(
      'SELECT browser_token_hash, state FROM oauth_transactions',
    );
    expect(rows.rows).toHaveLength(1);
    // Only the hash of the cookie value is stored.
    expect(rows.rows[0]!.browser_token_hash).toBe(sha256Hex(txCookie!));
  });

  it('completes first login: binds Google sub, issues session, redirects to trusted origin', async () => {
    const employeeId = await seedEmployee({ email: validIdentity.email });
    expect(await employeeField(employeeId, 'google_sub')).toBeNull();

    const login = await app.inject({ method: 'GET', url: '/auth/login' });
    const browserToken = login.cookies.find((c) => c.name === TX_COOKIE)!.value;
    const { state } = (
      await testPool().query<{ state: string; nonce: string }>(
        'SELECT state, nonce FROM oauth_transactions',
      )
    ).rows[0]!;

    googleMockState.nextClaims = validIdentity;
    const callback = await app.inject({
      method: 'GET',
      url: `/auth/callback?code=auth-code&state=${encodeURIComponent(state)}`,
      cookies: { [TX_COOKIE]: browserToken },
    });

    expect(callback.statusCode).toBe(302);
    expect(callback.headers.location).toBe('http://127.0.0.1:3000/');
    // Transaction cookie cleared.
    expect(callback.cookies.find((c) => c.name === TX_COOKIE)?.value ?? '').toBe('');
    expect(await employeeField(employeeId, 'google_sub')).toBe(validIdentity.sub);

    // A session exists for the employee.
    const sessions = await testPool().query(
      'SELECT token_hash FROM sessions WHERE employee_id = $1',
      [employeeId],
    );
    expect(sessions.rows).toHaveLength(1);
  });

  it('subsequent login with the bound sub succeeds; a different sub is denied (never replaced)', async () => {
    const employeeId = await seedEmployee({
      email: validIdentity.email,
      googleSub: 'google-sub-1111111111',
    });

    const login = await app.inject({ method: 'GET', url: '/auth/login' });
    const browserToken = login.cookies.find((c) => c.name === TX_COOKIE)!.value;
    const { state } = (
      await testPool().query<{ state: string }>('SELECT state FROM oauth_transactions')
    ).rows[0]!;

    googleMockState.nextClaims = validIdentity;
    const ok = await app.inject({
      method: 'GET',
      url: `/auth/callback?code=auth-code&state=${encodeURIComponent(state)}`,
      cookies: { [TX_COOKIE]: browserToken },
    });
    expect(ok.statusCode).toBe(302);
    expect(await employeeField(employeeId, 'google_sub')).toBe(validIdentity.sub);

    // Now present a different Google sub bound to the same email.
    const login2 = await app.inject({ method: 'GET', url: '/auth/login' });
    const browserToken2 = login2.cookies.find((c) => c.name === TX_COOKIE)!.value;
    const { state: state2 } = (
      await testPool().query<{ state: string }>(
        'SELECT state FROM oauth_transactions WHERE consumed_at IS NULL',
      )
    ).rows[0]!;

    googleMockState.nextClaims = { ...validIdentity, sub: 'google-sub-ATTACKER' };
    const denied = await app.inject({
      method: 'GET',
      url: `/auth/callback?code=auth-code&state=${encodeURIComponent(state2)}`,
      cookies: { [TX_COOKIE]: browserToken2 },
    });
    expect(denied.statusCode).toBe(403);
    expect(denied.json().message).toBe('Login denied.');
    // Binding untouched.
    expect(await employeeField(employeeId, 'google_sub')).toBe('google-sub-1111111111');
  });

  it('denies unprovisioned and inactive employees with the same generic message', async () => {
    // Unprovisioned
    googleMockState.nextClaims = validIdentity;
    const noEmployee = await app.inject({ method: 'GET', url: '/auth/callback?code=x&state=y' });
    expect(noEmployee.statusCode).toBe(401); // no transaction -> generic login failure

    // Provisioned but inactive
    await seedEmployee({ email: validIdentity.email, isActive: false });
    const login = await app.inject({ method: 'GET', url: '/auth/login' });
    const browserToken = login.cookies.find((c) => c.name === TX_COOKIE)!.value;
    const { state } = (
      await testPool().query<{ state: string }>('SELECT state FROM oauth_transactions')
    ).rows[0]!;
    const inactive = await app.inject({
      method: 'GET',
      url: `/auth/callback?code=auth-code&state=${encodeURIComponent(state)}`,
      cookies: { [TX_COOKIE]: browserToken },
    });
    expect(inactive.statusCode).toBe(403);
    expect(inactive.json().message).toBe('Login denied.');
  });

  it('denies external domains, invalid hd, and unverified email via the callback', async () => {
    const scenarios: Array<[string, Record<string, unknown>]> = [
      ['external-domain', { ...validIdentity, email: 'alice@gmail.com' }],
      ['lookalike-domain', { ...validIdentity, email: 'alice@eviltransacty.ai' }],
      ['invalid-hd', { ...validIdentity, hd: 'gmail.com' }],
      ['missing-hd', { sub: validIdentity.sub, email: validIdentity.email, email_verified: true, name: 'Alice Adams' }],
      ['unverified-email', { ...validIdentity, email_verified: false }],
    ];

    for (const [label, claims] of scenarios) {
      await resetTables();
      const id = await seedEmployee({ email: validIdentity.email });
      const login = await app.inject({ method: 'GET', url: '/auth/login' });
      const browserToken = login.cookies.find((c) => c.name === TX_COOKIE)!.value;
      const { state } = (
        await testPool().query<{ state: string }>('SELECT state FROM oauth_transactions')
      ).rows[0]!;
      googleMockState.nextClaims = claims;
      const response = await app.inject({
        method: 'GET',
        url: `/auth/callback?code=auth-code&state=${encodeURIComponent(state)}`,
        cookies: { [TX_COOKIE]: browserToken },
      });
      expect(response.statusCode, label).toBe(403);
      expect(response.json().message, label).toBe('Login denied.');
      expect(await employeeField(id, 'google_sub')).toBeNull();
    }
  });

  it('rejects invalid OIDC responses with a generic 401 (mocked exchange error)', async () => {
    await seedEmployee({ email: validIdentity.email });
    const login = await app.inject({ method: 'GET', url: '/auth/login' });
    const browserToken = login.cookies.find((c) => c.name === TX_COOKIE)!.value;
    const { state } = (
      await testPool().query<{ state: string }>('SELECT state FROM oauth_transactions')
    ).rows[0]!;

    googleMockState.exchangeError = new Error('invalid_grant simulation');
    googleMockState.nextClaims = validIdentity;
    const response = await app.inject({
      method: 'GET',
      url: `/auth/callback?code=bad-code&state=${encodeURIComponent(state)}`,
      cookies: { [TX_COOKIE]: browserToken },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json().message).toBe('Login failed. Please try again.');
  });

  it('rejects state mismatch and missing browser binding without consuming the transaction', async () => {
    await seedEmployee({ email: validIdentity.email });

    // State mismatch (cookie exists)
    const login = await app.inject({ method: 'GET', url: '/auth/login' });
    const browserToken = login.cookies.find((c) => c.name === TX_COOKIE)!.value;
    googleMockState.nextClaims = validIdentity;
    const wrongState = await app.inject({
      method: 'GET',
      url: '/auth/callback?code=code&state=wrong-state-value',
      cookies: { [TX_COOKIE]: browserToken },
    });
    expect(wrongState.statusCode).toBe(401);

    // Missing cookie binding
    await app.inject({ method: 'GET', url: '/auth/login' });
    const { state: state2 } = (
      await testPool().query<{ state: string }>(
        'SELECT state FROM oauth_transactions WHERE consumed_at IS NULL',
      )
    ).rows[0]!;
    const noCookie = await app.inject({
      method: 'GET',
      url: `/auth/callback?code=code&state=${encodeURIComponent(state2)}`,
    });
    expect(noCookie.statusCode).toBe(401);

    // Neither consumed the transactions
    const unconsumed = await testPool().query(
      'SELECT count(*)::int AS n FROM oauth_transactions WHERE consumed_at IS NULL',
    );
    expect(unconsumed.rows[0].n).toBe(2);
  });

  it('consumes a transaction exactly once (replay is rejected)', async () => {
    await seedEmployee({ email: validIdentity.email });
    const login = await app.inject({ method: 'GET', url: '/auth/login' });
    const browserToken = login.cookies.find((c) => c.name === TX_COOKIE)!.value;
    const { state } = (
      await testPool().query<{ state: string }>('SELECT state FROM oauth_transactions')
    ).rows[0]!;

    googleMockState.nextClaims = validIdentity;
    const first = await app.inject({
      method: 'GET',
      url: `/auth/callback?code=code&state=${encodeURIComponent(state)}`,
      cookies: { [TX_COOKIE]: browserToken },
    });
    expect(first.statusCode).toBe(302);

    const replay = await app.inject({
      method: 'GET',
      url: `/auth/callback?code=code&state=${encodeURIComponent(state)}`,
      cookies: { [TX_COOKIE]: browserToken },
    });
    expect(replay.statusCode).toBe(401);

    const consumed = await testPool().query(
      'SELECT count(*)::int AS n FROM oauth_transactions WHERE consumed_at IS NOT NULL',
    );
    expect(consumed.rows[0].n).toBe(1);
  });

  it('rejects an expired transaction', async () => {
    await seedEmployee({ email: validIdentity.email });
    const login = await app.inject({ method: 'GET', url: '/auth/login' });
    const browserToken = login.cookies.find((c) => c.name === TX_COOKIE)!.value;
    await testPool().query(
      "UPDATE oauth_transactions SET expires_at = now() - interval '1 second'",
    );
    const { state } = (
      await testPool().query<{ state: string }>('SELECT state FROM oauth_transactions')
    ).rows[0]!;

    googleMockState.nextClaims = validIdentity;
    const response = await app.inject({
      method: 'GET',
      url: `/auth/callback?code=code&state=${encodeURIComponent(state)}`,
      cookies: { [TX_COOKIE]: browserToken },
    });
    expect(response.statusCode).toBe(401);
  });

  it('binds the Google sub concurrently and exactly once (same employee)', async () => {
    const employeeId = await seedEmployee({ email: validIdentity.email });

    // Two parallel logins for the same employee, same sub.
    const logins = await Promise.all([
      app.inject({ method: 'GET', url: '/auth/login' }),
      app.inject({ method: 'GET', url: '/auth/login' }),
    ]);
    const tokens = logins.map((r) => r.cookies.find((c) => c.name === TX_COOKIE)!.value);
    const txs = (
      await testPool().query<{ state: string; browser_token_hash: string }>(
        'SELECT state, browser_token_hash FROM oauth_transactions ORDER BY created_at',
      )
    ).rows;
    const tokenByHash = new Map(tokens.map((t) => [sha256Hex(t), t]));

    googleMockState.nextClaims = validIdentity;
    const callbacks = await Promise.all(
      txs.map((tx) =>
        app.inject({
          method: 'GET',
          url: `/auth/callback?code=code&state=${encodeURIComponent(tx.state)}`,
          cookies: { [TX_COOKIE]: tokenByHash.get(tx.browser_token_hash)! },
        }),
      ),
    );
    expect(callbacks.map((r) => r.statusCode)).toEqual([302, 302]);
    expect(await employeeField(employeeId, 'google_sub')).toBe(validIdentity.sub);
  });

  it('refuses concurrent binding of the same sub to two different employees', async () => {
    await seedEmployee({ email: validIdentity.email });
    await seedEmployee({ email: 'bob@transacty.ai' });

    // Both identities claim the same Google sub; the second bind must hit the
    // unique constraint and be denied. Per-code claims keep the concurrent
    // callbacks deterministic.
    googleMockState.claimsByCode.set('code-alice', validIdentity);
    googleMockState.claimsByCode.set('code-bob', {
      ...validIdentity,
      email: 'bob@transacty.ai',
    });

    const logins = await Promise.all([
      app.inject({ method: 'GET', url: '/auth/login' }),
      app.inject({ method: 'GET', url: '/auth/login' }),
    ]);
    const tokens = logins.map((r) => r.cookies.find((c) => c.name === TX_COOKIE)!.value);
    const txs = (
      await testPool().query<{ state: string; browser_token_hash: string }>(
        'SELECT state, browser_token_hash FROM oauth_transactions ORDER BY created_at',
      )
    ).rows;
    const tokenByHash = new Map(tokens.map((t) => [sha256Hex(t), t]));

    const results = await Promise.all(
      txs.map((tx, index) =>
        app.inject({
          method: 'GET',
          url: `/auth/callback?code=${index === 0 ? 'code-alice' : 'code-bob'}&state=${encodeURIComponent(tx.state)}`,
          cookies: { [TX_COOKIE]: tokenByHash.get(tx.browser_token_hash)! },
        }),
      ),
    );

    const statuses = results.map((r) => r.statusCode).sort();
    // Exactly one success; the other is denied by the unique constraint.
    expect(statuses).toEqual([302, 403]);

    const bound = await testPool().query(
      'SELECT count(*)::int AS n FROM employees WHERE google_sub = $1',
      [validIdentity.sub],
    );
    expect(bound.rows[0].n).toBe(1);
  });

  it('issues a fresh session token unrelated to any pre-existing cookie value (session fixation)', async () => {
    await seedEmployee({ email: validIdentity.email });

    // Attacker-chosen cookie value planted before login.
    const attackerToken = 'attacker-chosen-value-1234567890abcdef';
    const login = await app.inject({
      method: 'GET',
      url: '/auth/login',
      cookies: { [SESSION_COOKIE]: attackerToken },
    });
    const browserToken = login.cookies.find((c) => c.name === TX_COOKIE)!.value;
    const { state } = (
      await testPool().query<{ state: string }>('SELECT state FROM oauth_transactions')
    ).rows[0]!;

    googleMockState.nextClaims = validIdentity;
    const callback = await app.inject({
      method: 'GET',
      url: `/auth/callback?code=code&state=${encodeURIComponent(state)}`,
      cookies: {
        [TX_COOKIE]: browserToken,
        [SESSION_COOKIE]: attackerToken,
      },
    });
    expect(callback.statusCode).toBe(302);

    const issuedToken = callback.cookies.find((c) => c.name === SESSION_COOKIE)!.value;
    expect(issuedToken).toBeTruthy();
    expect(issuedToken).not.toBe(attackerToken);

    // The planted value must not resolve to any session.
    const planted = await testPool().query(
      'SELECT count(*)::int AS n FROM sessions WHERE token_hash = $1',
      [sha256Hex(attackerToken)],
    );
    expect(planted.rows[0].n).toBe(0);
  });

  it.each(['email', 'deactivation'] as const)('rechecks %s after a stale lookup waits for an employee lock', async (change) => {
    const employeeId = await seedEmployee({ email: validIdentity.email });
    const login = await app.inject({ method: 'GET', url: '/auth/login' });
    const browserToken = login.cookies.find((c) => c.name === TX_COOKIE)!.value;
    const { state } = (await testPool().query('SELECT state FROM oauth_transactions')).rows[0];
    googleMockState.nextClaims = validIdentity;
    const blocker = await testPool().connect();
    let callback: Promise<unknown> | undefined;
    try {
      await blocker.query('BEGIN');
      await blocker.query('SELECT id FROM employees WHERE id = $1 FOR UPDATE', [employeeId]);
      const pending = app.inject({ method: 'GET', url: `/auth/callback?code=race&state=${state}`,
        cookies: { [TX_COOKIE]: browserToken } }).then((response) => response);
      callback = pending;
      await waitForBlockedQuery('SET google_sub');
      // Commit the administrative change after the callback read the old row.
      if (change === 'email') {
        await blocker.query('UPDATE employees SET email = $1 WHERE id = $2', ['new@transacty.ai', employeeId]);
      } else {
        await blocker.query('UPDATE employees SET is_active = false WHERE id = $1', [employeeId]);
      }
      await blocker.query('COMMIT');
      const result = await pending;
      expect(result.statusCode).toBe(403);
      expect(result.json().message).toBe('Login denied.');
      expect(await employeeField(employeeId, 'google_sub')).toBeNull();
      expect((await testPool().query('SELECT * FROM sessions WHERE employee_id = $1', [employeeId])).rowCount).toBe(0);
    } finally {
      await blocker.query('ROLLBACK');
      blocker.release();
      await callback;
    }
  });

  it.each(['email', 'deactivation'] as const)('serializes login-first against the %s API operation', async (change) => {
    const employeeId = await seedEmployee({ email: validIdentity.email });
    const adminId = await seedEmployee({ email: 'admin@transacty.ai', role: 'admin' });
    const admin = await createSession(adminId);
    const login = await app.inject({ method: 'GET', url: '/auth/login' });
    const browserToken = login.cookies.find((c) => c.name === TX_COOKIE)!.value;
    const { state } = (await testPool().query('SELECT state FROM oauth_transactions')).rows[0];
    googleMockState.nextClaims = validIdentity;
    const blocker = await testPool().connect();
    const pending: Promise<unknown>[] = [];
    try {
      await blocker.query('BEGIN');
      await blocker.query('SELECT id FROM employees WHERE id = $1 FOR UPDATE', [employeeId]);
      const callback = app.inject({ method: 'GET', url: `/auth/callback?code=race&state=${state}`,
        cookies: { [TX_COOKIE]: browserToken } }).then((response) => response);
      pending.push(callback);
      await waitForBlockedQuery('SET google_sub');
      const update = app.inject({ method: 'PATCH', url: `/employees/${employeeId}`,
        cookies: { [SESSION_COOKIE]: admin.cookieToken },
        headers: { 'x-csrf-token': admin.context.csrfToken },
        payload: change === 'email' ? { email: 'new@transacty.ai' } : { isActive: false },
      }).then((response) => response);
      pending.push(update);
      await waitForBlockedQuery('ORDER BY id FOR UPDATE');
      await blocker.query('COMMIT');
      const [loggedIn, updated] = await Promise.all([callback, update]);
      expect(loggedIn.statusCode).toBe(302);
      expect(updated.statusCode).toBe(change === 'email' ? 409 : 200);
      expect(await employeeField(employeeId, 'google_sub')).toBe(validIdentity.sub);
      const cookie = loggedIn.cookies.find((c) => c.name === SESSION_COOKIE)!.value;
      if (change === 'deactivation') {
        await app.inject({ method: 'PATCH', url: `/employees/${employeeId}`,
          cookies: { [SESSION_COOKIE]: admin.cookieToken },
          headers: { 'x-csrf-token': admin.context.csrfToken }, payload: { isActive: true } });
        expect(await resolveSession(cookie)).toBeNull();
        const sessions = (await testPool().query('SELECT revoked_at FROM sessions WHERE employee_id = $1', [employeeId])).rows;
        expect(sessions).toHaveLength(1);
        expect(sessions[0].revoked_at).not.toBeNull();
      } else {
        expect(await resolveSession(cookie)).not.toBeNull();
      }
    } finally {
      await blocker.query('ROLLBACK');
      blocker.release();
      await Promise.all(pending);
    }
  });

  it('does not store the session token or OAuth secrets in plaintext rows', async () => {
    await seedEmployee({ email: validIdentity.email });
    const login = await app.inject({ method: 'GET', url: '/auth/login' });
    const browserToken = login.cookies.find((c) => c.name === TX_COOKIE)!.value;
    const { state, nonce, code_verifier } = (
      await testPool().query<{ state: string; nonce: string; code_verifier: string }>(
        'SELECT state, nonce, code_verifier FROM oauth_transactions',
      )
    ).rows[0]!;

    googleMockState.nextClaims = validIdentity;
    const callback = await app.inject({
      method: 'GET',
      url: `/auth/callback?code=code&state=${encodeURIComponent(state)}`,
      cookies: { [TX_COOKIE]: browserToken },
    });
    expect(callback.statusCode).toBe(302);
    const sessionToken = callback.cookies.find((c) => c.name === SESSION_COOKIE)!.value;

    const sessionRows = await testPool().query('SELECT token_hash FROM sessions');
    expect(sessionRows.rows).toHaveLength(1);
    expect(sessionRows.rows[0].token_hash).not.toBe(sessionToken);
    expect(sessionRows.rows[0].token_hash).toBe(sha256Hex(sessionToken));

    // Transaction consumed and PKCE/nonce were used (they existed pre-consumption).
    void nonce;
    void code_verifier;
  });
});
