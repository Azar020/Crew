import type { FastifyInstance } from 'fastify';
import { trustedOrigins } from '../config/env.js';
import { AppError } from '../shared/errors.js';

/**
 * Application-wide HTTP security hooks.
 *
 * Exact allowed-Origin validation for state-changing requests: if a request
 * carries an `Origin` header it must match a configured trusted origin
 * exactly (scheme + host + port, no pattern matching). Unapproved origins
 * are rejected with 403 — SameSite cookie attributes alone are never relied
 * upon for CSRF protection.
 *
 * Missing-Origin policy (safe by construction): requests without an Origin
 * header (curl, Postman, non-browser clients) are accepted here, because the
 * session-bound CSRF token check remains MANDATORY for every state-changing
 * route — an attacker page cannot obtain that token. Any future
 * state-changing route MUST apply the requireCsrf guard.
 */
const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function isOriginAllowed(
  origin: string | undefined,
  allowedOrigins: readonly string[],
): boolean {
  if (origin === undefined) {
    return true;
  }
  return allowedOrigins.includes(origin);
}

export async function registerHttpSecurity(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', async (request) => {
    if (!STATE_CHANGING_METHODS.has(request.method)) return;
    const origin = request.headers.origin;
    if (!isOriginAllowed(origin, trustedOrigins())) {
      throw new AppError('Request origin is not allowed', 403);
    }
  });
}
