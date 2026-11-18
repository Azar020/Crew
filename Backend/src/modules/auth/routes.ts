import type { FastifyInstance } from 'fastify';
import { requireAuth, requireCsrf } from './guards.js';
import {
  csrf,
  handleLoginCallback,
  loginWithPassword,
  logout,
  me,
  registerPublicEmployee,
  startLogin,
} from './service.js';

/**
 * Authentication routes.
 *
 * Public (protected by the OAuth transaction flow itself):
 *   GET /auth/login     — starts the Google OIDC authorization-code flow
 *   GET /auth/callback  — consumes the transaction, verifies the identity,
 *                         issues the application session
 *
 * Session-protected (requireAuth):
 *   GET /auth/me        — current employee identity and role
 *   GET /auth/csrf      — the session-bound CSRF token for state-changing calls
 *   POST /auth/logout   — requireAuth + CSRF validation; revokes the session
 *
 * Login and /auth/callback are rate-limited per IP; 503 is returned when
 * Google credentials are not configured (fail closed).
 */
export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/auth/login',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) => startLogin(request, reply),
  );

  app.get(
    '/auth/callback',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request, reply) => handleLoginCallback(request, reply),
  );

  app.post(
    '/auth/login',
    { config: { rateLimit: { max: 15, timeWindow: '1 minute' } } },
    async (request, reply) => loginWithPassword(request, reply),
  );

  app.post(
    '/auth/register',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) => registerPublicEmployee(request, reply),
  );

  app.get(
    '/auth/me',
    {
      preHandler: [requireAuth],
      config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
    },
    async (request, reply) => me(request, reply),
  );

  app.get(
    '/auth/csrf',
    {
      preHandler: [requireAuth],
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    },
    async (request, reply) => csrf(request, reply),
  );

  app.post(
    '/auth/logout',
    {
      preHandler: [requireAuth, requireCsrf],
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
    },
    async (request, reply) => logout(request, reply),
  );
}
