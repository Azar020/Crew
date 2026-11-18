import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from '../../shared/errors.js';
import type { Role } from '../../shared/roles.js';
import { resolveSession, SESSION_COOKIE_NAME, verifyCsrfToken } from './service.js';

/**
 * Authentication and authorization guards.
 *
 * - `requireAuth`  — 401 unless a valid, unexpired, unrevoked session cookie
 *                    is presented; attaches the trusted employee/session
 *                    context to the request.
 * - `requireRole`  — 403 unless the authenticated employee has the role.
 * - `requireCsrf`  — 403 unless the request presents the session-bound CSRF
 *                    token (mandatory for state-changing requests; paired
 *                    with exact allowed-Origin validation at the app level).
 *
 * Reusable pattern for future protected route groups:
 *
 *   app.register(async (scope) => {
 *     scope.addHook('preHandler', requireAuth);          // whole group
 *     scope.addHook('preHandler', requireRole('admin')); // role-locked group
 *     scope.get('/...', handler);
 *   });
 *
 * or per-route: `{ preHandler: [requireAuth, requireRole('admin')] }`.
 * Ownership checks must use `request.auth.employeeId` in feature queries —
 * never client-supplied ownership data.
 */

/** Authentication context attached to authenticated requests. */
export interface RequestAuth {
  sessionId: string;
  employeeId: string;
  email: string;
  name: string;
  role: Role;
  /** Raw session-bound CSRF token for comparison against the header. */
  csrfToken: string;
  department?: string | null;
  designation?: string | null;
  timezone?: string | null;
  employeeCode?: string | null;
}

declare module 'fastify' {
  interface FastifyRequest {
    /** Present only after requireAuth succeeds. */
    auth: RequestAuth | null;
  }
}

export const requireAuth = async (
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> => {
  const token = request.cookies[SESSION_COOKIE_NAME];
  if (token !== undefined && token.length > 0) {
    const context = await resolveSession(token);
    if (context) {
      request.auth = {
        sessionId: context.sessionId,
        employeeId: context.employeeId,
        email: context.email,
        name: context.name,
        role: context.role,
        csrfToken: context.csrfToken,
      };
      return;
    }
  }
  // Invalid, expired, revoked sessions and inactive employees all fail
  // closed with 401. No information is leaked about what failed.
  throw new AppError('Authentication required', 401);
};

export const requireRole =
  (role: Role) =>
  async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    const auth = request.auth;
    if (!auth) {
      // Guard used without requireAuth running first — fail closed.
      throw new AppError('Authentication required', 401);
    }
    if (auth.role !== role) {
      throw new AppError('Insufficient role', 403);
    }
  };

export const requireCsrf = async (
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> => {
  const auth = request.auth;
  if (!auth) {
    throw new AppError('Authentication required', 401);
  }
  const presented = request.headers['x-csrf-token'];
  const token = Array.isArray(presented) ? presented[0] : presented;
  if (!verifyCsrfToken(token, auth)) {
    throw new AppError('CSRF token missing or invalid', 403);
  }
};

/** Convenience helper registering the decorations on the app. */
export function decorateRequestsWithAuth(app: FastifyInstance): void {
  app.decorateRequest('auth', null);
}
