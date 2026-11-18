import type { FastifyRequest, FastifyReply } from 'fastify';
import { sql } from 'drizzle-orm';
import { env, postLoginRedirect } from '../../config/env.js';
import { db } from '../../db/index.js';
import { AppError, LoginDeniedError } from '../../shared/errors.js';
import { hashPassword, randomToken, safeEquals, sha256Hex, verifyPassword } from '../../shared/hashing.js';
import type { Role } from '../../shared/roles.js';
import { ALLOWED_EMAIL_DOMAINS, OAUTH_TRANSACTION_TTL_SECONDS, SESSION_TOKEN_BYTES } from './constants.js';
import {
  buildGoogleAuthorizationRequest,
  exchangeAuthorizationCode,
  LoginNotConfiguredError,
} from './google.js';
import { loginCallbackQuerySchema } from './schemas.js';

/**
 * Authentication business logic: Google OIDC login flow, application-owned
 * sessions, logout. All authorization-critical decisions are made here from
 * database state — never from client input.
 */

/** Extracts the PostgreSQL error code, unwrapping Drizzle's error wrapper. */
function pgErrorCode(error: unknown): string | undefined {
  const direct = (error as { code?: unknown }).code;
  if (typeof direct === 'string') return direct;
  const cause = (error as { cause?: { code?: unknown } }).cause;
  if (cause && typeof cause.code === 'string') return cause.code;
  return undefined;
}

export interface AuthContext {
  sessionId: string;
  employeeId: string;
  email: string;
  name: string;
  role: Role;
  csrfToken: string;
  department?: string | null;
  designation?: string | null;
  timezone?: string | null;
  employeeCode?: string | null;
}

const isProduction = env.NODE_ENV === 'production';

export const SESSION_COOKIE_NAME = isProduction ? '__Host-session' : 'teamdesk_session';
export const OAUTH_TX_COOKIE_NAME = isProduction ? '__Host-auth-tx' : 'teamdesk_oauth_tx';

/** Cookie attributes. __Host- cookies require Secure + Path=/ + no Domain. */
function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: isProduction,
  } as const;
}

/* ------------------------------------------------------------------ *
 * Login (GET /auth/login)
 * ------------------------------------------------------------------ */

/**
 * Creates a fresh, browser-bound OAuth transaction and redirects to Google.
 * Transactions expire after five minutes and are consumed exactly once.
 */
export async function startLogin(
  _request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { authorizationUrl, state, nonce, codeVerifier } =
    await buildGoogleAuthorizationRequest();

  // Opportunistic housekeeping: drop long-expired transactions.
  await db.execute(
    sql`DELETE FROM oauth_transactions WHERE expires_at < now() - interval '1 day'`,
  );

  const browserToken = randomToken(SESSION_TOKEN_BYTES);
  const browserTokenHash = sha256Hex(browserToken);

  // Retry loop is effectively theoretical (state values carry ~192 bits of
  // entropy and are unique-indexed) but keeps a collision from turning into
  // a 500.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await db.execute(sql`
        INSERT INTO oauth_transactions
          (state, nonce, code_verifier, browser_token_hash, expires_at)
        VALUES (
          ${state}, ${nonce}, ${codeVerifier}, ${browserTokenHash},
          now() + make_interval(secs => ${OAUTH_TRANSACTION_TTL_SECONDS})
        )
      `);
      break;
    } catch (error) {
      if (pgErrorCode(error) === '23505' && attempt < 2) continue; // unique violation: retry
      throw error;
    }
  }

  reply.setCookie(OAUTH_TX_COOKIE_NAME, browserToken, {
    ...cookieOptions(),
    maxAge: OAUTH_TRANSACTION_TTL_SECONDS,
  });
  return reply.redirect(authorizationUrl.toString(), 302);
}

/* ------------------------------------------------------------------ *
 * Callback (GET /auth/callback)
 * ------------------------------------------------------------------ */

const LOGIN_FAILED_MESSAGE = 'Login failed. Please try again.';

/**
 * Consumes the browser-bound transaction exactly once, exchanges the
 * authorization code, validates the identity against company policy,
 * binds/uses the stored Google identity, and issues a fresh session.
 */
export async function handleLoginCallback(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const parsedQuery = loginCallbackQuerySchema.safeParse(request.query);
  const code = parsedQuery.success ? parsedQuery.data.code : undefined;
  const state = parsedQuery.success ? parsedQuery.data.state : undefined;
  const oauthError = parsedQuery.success ? parsedQuery.data.error : undefined;

  // Google redirected back with an OAuth error (e.g. access_denied).
  if (oauthError !== undefined || code === undefined || state === undefined) {
    throw new AppError(LOGIN_FAILED_MESSAGE, 401);
  }

  // 1. Browser binding: the transaction must match the initiating browser's
  //    cookie AND the state parameter, and must be unconsumed and unexpired.
  //    Consumption is atomic: the UPDATE only succeeds once.
  const browserToken = request.cookies[OAUTH_TX_COOKIE_NAME];
  if (browserToken === undefined || browserToken.length === 0) {
    throw new AppError(LOGIN_FAILED_MESSAGE, 401);
  }

  const consumed = await db.execute<{
    id: string;
    nonce: string;
    code_verifier: string;
  }>(sql`
    UPDATE oauth_transactions
    SET consumed_at = now()
    WHERE browser_token_hash = ${sha256Hex(browserToken)}
      AND state = ${state}
      AND consumed_at IS NULL
      AND expires_at > now()
    RETURNING id, nonce, code_verifier
  `);
  const transaction = consumed.rows[0];
  if (!transaction) {
    throw new AppError(LOGIN_FAILED_MESSAGE, 401);
  }

  // 2. Exchange the code. The library validates the full authorization
  //    response (including the `iss` parameter), then the token response and
  //    ID token (signature, issuer, audience, expiry, nonce); google.ts then
  //    applies the policy checks. The callback URL's origin must match the
  //    configured redirect URI exactly — never derived from request headers
  //    alone.
  const configuredRedirect = new URL(env.OAUTH_REDIRECT_URI);
  const callbackUrl = new URL(request.url ?? '/', configuredRedirect.origin);
  if (callbackUrl.origin !== configuredRedirect.origin) {
    request.log.info('callback origin does not match configured redirect URI');
    throw new AppError(LOGIN_FAILED_MESSAGE, 401);
  }

  let identity;
  try {
    identity = await exchangeAuthorizationCode({
      callbackUrl: callbackUrl.toString(),
      codeVerifier: transaction.code_verifier,
      expectedState: state,
      expectedNonce: transaction.nonce,
    });
  } catch (error) {
    if (
      error instanceof LoginDeniedError ||
      error instanceof LoginNotConfiguredError
    ) {
      throw error;
    }
    request.log.info(
      { err: error },
      'OIDC code exchange failed',
    );
    throw new AppError(LOGIN_FAILED_MESSAGE, 401);
  }

  // 3. Require a pre-provisioned, active employee.
  const found = await db.execute<{
    id: string;
    name: string;
    is_active: boolean;
    google_sub: string | null;
  }>(sql`
    SELECT id, name, is_active, google_sub FROM employees
    WHERE email = ${identity.email}
  `);
  const employee = found.rows[0];
  if (!employee || !employee.is_active) {
    // Generic denial: never reveal whether/why an email is registered.
    throw new LoginDeniedError();
  }

  // 4. Identity binding. First login binds the Google sub atomically; later
  //    logins must match the existing binding. Bindings are never silently
  //    replaced, and collisions (another employee claiming the same sub)
  //    are refused.
  let context: CreatedSession;
  if (employee.google_sub === null || employee.google_sub === identity.sub) {
    try {
      // Atomic and idempotent: binds when unbound, succeeds when already
      // bound to the SAME sub (concurrent logins), and can never overwrite a
      // different sub. Collisions with another employee hit the unique
      // index and are denied below.
      context = await db.transaction(async (tx) => {
        const bound = await tx.execute<{ id: string }>(sql`
          UPDATE employees
          SET google_sub = ${identity.sub}, updated_at = now()
          WHERE id = ${employee.id}
            AND email = ${identity.email}
            AND is_active
            AND (google_sub IS NULL OR google_sub = ${identity.sub})
          RETURNING id
        `);
        if (!bound.rows[0]) throw new LoginDeniedError();
        // Hold the employee lock through session issuance. Email edits and
        // deactivation either precede these checks or follow (and revoke) issuance.
        return createSessionInTransaction(employee.id, tx);
      });
    } catch (error) {
      if (error instanceof LoginDeniedError) throw error;
      if (pgErrorCode(error) === '23505') throw new LoginDeniedError(); // unique violation
      throw error;
    }
  } else {
    throw new LoginDeniedError();
  }

  // 5. Deliver the fresh session issued atomically with binding above.

  reply.setCookie(SESSION_COOKIE_NAME, context.cookieToken, {
    ...cookieOptions(),
    maxAge: env.SESSION_ABSOLUTE_HOURS * 60 * 60,
  });
  reply.clearCookie(OAUTH_TX_COOKIE_NAME, { ...cookieOptions(), maxAge: 0 });
  return reply.redirect(postLoginRedirect(), 302);
}

/* ------------------------------------------------------------------ *
 * Sessions
 * ------------------------------------------------------------------ */

export interface CreatedSession {
  cookieToken: string;
  context: AuthContext;
}

/** Creates a session row and returns the cookie token + resolved context. */
export async function createSession(employeeId: string): Promise<CreatedSession> {
  return db.transaction((tx) => createSessionInTransaction(employeeId, tx));
}

async function createSessionInTransaction(
  employeeId: string,
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
): Promise<CreatedSession> {
  const active = await tx.execute(sql`
    SELECT id FROM employees WHERE id = ${employeeId} AND is_active FOR UPDATE
  `);
  if (!active.rows[0]) throw new LoginDeniedError();
  const token = randomToken(SESSION_TOKEN_BYTES);
  const csrfToken = randomToken(SESSION_TOKEN_BYTES);

  const inserted = await tx.execute<{
    id: string;
    employee_id: string;
    email: string;
    name: string;
    role: Role;
    csrf_token: string;
  }>(sql`
    WITH ins AS (
      INSERT INTO sessions
        (token_hash, employee_id, csrf_token, idle_expires_at, absolute_expires_at)
      VALUES (
        ${sha256Hex(token)},
        ${employeeId},
        ${csrfToken},
        LEAST(
          now() + make_interval(mins => ${env.SESSION_IDLE_MINUTES}),
          now() + make_interval(hours => ${env.SESSION_ABSOLUTE_HOURS})
        ),
        now() + make_interval(hours => ${env.SESSION_ABSOLUTE_HOURS})
      )
      RETURNING id, employee_id, csrf_token
    )
    SELECT ins.id, ins.employee_id, ins.csrf_token, e.email, e.name, e.role
    FROM ins JOIN employees e ON e.id = ins.employee_id
  `);

  const row = inserted.rows[0];
  if (!row) {
    throw new Error('Session creation returned no row');
  }

  return {
    cookieToken: token,
    context: {
      sessionId: row.id,
      employeeId: row.employee_id,
      email: row.email,
      name: row.name,
      role: row.role,
      csrfToken: row.csrf_token,
    },
  };
}

/**
 * Resolves the session from its opaque cookie token:
 * - rejects revoked, idle-expired, or absolutely-expired sessions,
 * - rejects sessions whose employee is inactive,
 * - extends the idle window (capped at the absolute expiry — activity never
 *   extends the absolute expiry),
 * - loads current employee identity/role from the database.
 *
 * A single atomic UPDATE ... RETURNING makes the validity check and the
 * activity refresh one consistent operation.
 */
export async function resolveSession(rawToken: string): Promise<AuthContext | null> {
  const result = await db.execute<{
    session_id: string;
    employee_id: string;
    email: string;
    name: string;
    role: Role;
    csrf_token: string;
    department: string | null;
    designation: string | null;
    timezone: string | null;
    employee_id_code: string | null;
  }>(sql`
    UPDATE sessions s
    SET last_activity_at = now(),
        idle_expires_at = LEAST(
          now() + make_interval(mins => ${env.SESSION_IDLE_MINUTES}),
          s.absolute_expires_at
        )
    FROM employees e
    WHERE s.token_hash = ${sha256Hex(rawToken)}
      AND s.revoked_at IS NULL
      AND s.idle_expires_at > now()
      AND s.absolute_expires_at > now()
      AND s.employee_id = e.id
      AND e.is_active
    RETURNING
      s.id AS session_id,
      e.id AS employee_id,
      e.email,
      e.name,
      e.role,
      s.csrf_token,
      e.department,
      e.designation,
      e.timezone,
      e.employee_id AS employee_id_code
  `);

  const row = result.rows[0];
  if (!row) return null;

  return {
    sessionId: row.session_id,
    employeeId: row.employee_id,
    email: row.email,
    name: row.name,
    role: row.role,
    csrfToken: row.csrf_token,
    department: row.department,
    designation: row.designation,
    timezone: row.timezone,
    employeeCode: row.employee_id_code,
  };
}

/** Revokes a session by id. Idempotent. */
export async function revokeSession(sessionId: string): Promise<void> {
  await db.execute(sql`
    UPDATE sessions SET revoked_at = now()
    WHERE id = ${sessionId} AND revoked_at IS NULL
  `);
}

/* ------------------------------------------------------------------ *
 * Logout (POST /auth/logout)
 * ------------------------------------------------------------------ */

export async function logout(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const auth = request.auth;
  if (auth) {
    await revokeSession(auth.sessionId);
  }
  reply.clearCookie(SESSION_COOKIE_NAME, { ...cookieOptions(), maxAge: 0 });
  return reply.status(204).send();
}

/* ------------------------------------------------------------------ *
 * /auth/me and /auth/csrf
 * ------------------------------------------------------------------ */

export function me(request: FastifyRequest, reply: FastifyReply): void {
  const auth = request.auth;
  if (!auth) {
    throw new AppError('Authentication required', 401);
  }
  reply.header('cache-control', 'no-store');
  reply.send({
    employee: {
      id: auth.employeeId,
      email: auth.email,
      name: auth.name,
      role: auth.role,
      department: auth.department ?? null,
      designation: auth.designation ?? null,
      timezone: auth.timezone ?? null,
      employeeId: auth.employeeCode ?? null,
    },
  });
}

export function csrf(request: FastifyRequest, reply: FastifyReply): void {
  const auth = request.auth;
  if (!auth) {
    throw new AppError('Authentication required', 401);
  }
  reply.header('cache-control', 'no-store');
  reply.send({ csrfToken: auth.csrfToken });
}

/* ------------------------------------------------------------------ *
 * CSRF verification helper (used by the requireCsrf guard)
 * ------------------------------------------------------------------ */

/**
 * Exact, timing-safe match of the presented CSRF token against the session.
 */
export function verifyCsrfToken(presented: string | undefined, auth: AuthContext): boolean {
  if (presented === undefined || presented.length === 0) return false;
  return safeEquals(sha256Hex(presented), sha256Hex(auth.csrfToken));
}

/**
 * Credential authentication with secure password verification.
 * Authenticates against database records, verifies password using timing-safe scrypt,
 * and issues a real database session cookie.
 */
export async function loginWithPassword(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const body = request.body as { email?: string; password?: string } | undefined;

  if (!body?.email || typeof body.email !== 'string' || body.email.trim().length === 0) {
    throw new AppError('Email is required', 400);
  }
  if (!body?.password || typeof body.password !== 'string' || body.password.length === 0) {
    throw new AppError('Password is required', 400);
  }

  const cleanEmail = body.email.trim().toLowerCase();

  const found = await db.execute<{
    id: string;
    email: string;
    name: string;
    role: Role;
    timezone: string | null;
    is_active: boolean;
    department: string | null;
    designation: string | null;
    employee_id: string | null;
    password_hash: string | null;
  }>(sql`
    SELECT id, email, name, role, timezone, is_active, department, designation, employee_id, password_hash
    FROM employees WHERE email = ${cleanEmail}
  `);

  const employee = found.rows[0];
  if (!employee || !employee.password_hash) {
    throw new AppError('Invalid email or password', 401);
  }

  if (!employee.is_active) {
    throw new AppError('Your account is currently inactive. Please contact an administrator.', 403);
  }

  const isValid = await verifyPassword(body.password, employee.password_hash);
  if (!isValid) {
    throw new AppError('Invalid email or password', 401);
  }

  const session = await createSession(employee.id);

  reply.setCookie(SESSION_COOKIE_NAME, session.cookieToken, {
    ...cookieOptions(),
    maxAge: env.SESSION_ABSOLUTE_HOURS * 60 * 60,
  });

  reply.status(200).send({
    success: true,
    employee: {
      id: employee.id,
      email: employee.email,
      name: employee.name,
      role: employee.role,
      department: employee.department,
      designation: employee.designation,
      timezone: employee.timezone,
      employeeId: employee.employee_id,
    },
    csrfToken: session.context.csrfToken,
  });
}

/**
 * Public registration for employee accounts.
 * - Enforces strict password criteria (>=8 chars, letter, digit, special char).
 * - Enforces company email domain policy (must belong to ALLOWED_EMAIL_DOMAINS).
 * - HARDCODES role to 'employee' — public registration can NEVER create an admin.
 * - Stores scrypt hashed password in PostgreSQL.
 */
export async function registerPublicEmployee(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const body = request.body as {
    name?: string;
    email?: string;
    password?: string;
    employeeId?: string;
    department?: string;
    designation?: string;
  } | undefined;

  if (!body?.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
    throw new AppError('Full name is required', 400);
  }
  if (!body?.email || typeof body.email !== 'string' || body.email.trim().length === 0) {
    throw new AppError('Email is required', 400);
  }
  if (!body?.password || typeof body.password !== 'string' || body.password.length === 0) {
    throw new AppError('Password is required', 400);
  }

  const cleanName = body.name.trim().slice(0, 200);
  const cleanEmail = body.email.trim().toLowerCase();
  const cleanEmpId = body.employeeId?.trim() || null;

  // Validate company email domain
  const emailDomain = cleanEmail.split('@')[1] ?? '';
  if (!(ALLOWED_EMAIL_DOMAINS as readonly string[]).includes(emailDomain)) {
    throw new AppError(
      `Company email required. Allowed domains: ${ALLOWED_EMAIL_DOMAINS.join(', ')}`,
      400,
    );
  }

  // Validate password strength: min 8 chars, letter, number, special char
  const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
  if (!passwordRegex.test(body.password)) {
    throw new AppError(
      'Password must be at least 8 characters long and contain at least one letter, one number, and one special character.',
      400,
    );
  }

  // Check if employee email already exists
  const existing = await db.execute<{ id: string }>(sql`
    SELECT id FROM employees WHERE email = ${cleanEmail}
  `);
  if (existing.rows.length > 0) {
    throw new AppError('An account with this email address already exists.', 409);
  }

  const hashedPassword = await hashPassword(body.password);

  // Strictly assign 'employee' role. Never accept client-supplied role.
  const inserted = await db.execute<{
    id: string;
    email: string;
    name: string;
    role: Role;
    timezone: string | null;
    department: string | null;
    designation: string | null;
    employee_id: string | null;
  }>(sql`
    INSERT INTO employees (name, email, role, is_active, timezone, employee_id, password_hash, department, designation)
    VALUES (${cleanName}, ${cleanEmail}, 'employee', true, 'Asia/Kolkata', ${cleanEmpId}, ${hashedPassword}, ${body.department ?? 'Product & Engineering'}, ${body.designation ?? 'Software Engineer'})
    RETURNING id, email, name, role, timezone, department, designation, employee_id
  `);

  const created = inserted.rows[0];
  if (!created) {
    throw new AppError('Failed to create employee account', 500);
  }

  reply.status(201).send({
    success: true,
    message: `Account created successfully for ${created.name}! Please sign in.`,
    employee: {
      id: created.id,
      email: created.email,
      name: created.name,
      role: created.role,
      department: created.department,
      designation: created.designation,
      timezone: created.timezone,
      employeeId: created.employee_id,
    },
  });
}

/**
 * Validates a post-login redirect destination: only exact, configured
 * trusted origins are acceptable. Used wherever a redirect target is chosen;
 * never called with arbitrary headers.
 */
export function isTrustedDestination(candidate: string): boolean {
  return candidate === postLoginRedirect();
}
