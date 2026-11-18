import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import { registerErrorHandler } from './plugins/error-handler.js';
import { registerHttpSecurity } from './plugins/http-security.js';
import { decorateRequestsWithAuth } from './modules/auth/guards.js';
import { registerAuthRoutes } from './modules/auth/routes.js';
import { registerEmployeeRoutes } from './modules/employees/routes.js';
import { registerLeaveRoutes } from './modules/leave/routes.js';
import { registerDailyUpdateRoutes } from './modules/daily-updates/routes.js';
import { registerHolidayRoutes } from './modules/holidays/routes.js';
import { registerAttendanceRoutes } from './modules/attendance/routes.js';
import { registerBreakRoutes } from './modules/breaks/routes.js';
import { registerAnnouncementRoutes } from './modules/announcements/routes.js';
import { registerMeetingRoutes } from './modules/meetings/routes.js';

/**
 * Builds the Fastify application (without starting it). Server startup lives
 * in server.ts so tests can create and drive the app via `fastify.inject`.
 *
 * Registered surfaces:
 * - /health (public)
 * - /auth/login, /auth/callback (public, protected by the OAuth transaction
 *   flow and per-IP rate limits)
 * - /auth/me, /auth/csrf, /auth/logout (session-protected)
 *
 * - /employees (session-protected self-service and admin management)
 *
 * - /leave-requests, /daily-updates (session-protected; owner-scoped create,
 *   list, and PATCH edits)
 * - /holidays (session-protected reads; admin-only POST/PATCH/DELETE)
 *
 * - /attendance/check-in, /attendance/check-out (session-protected, CSRF, no
 *   body), /attendance/status, /attendance/me (session-protected reads),
 *   /attendance (admin-only history)
 */
export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: process.env.NODE_ENV === 'test' ? 'warn' : 'info',
      // Never log authentication or session material.
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.headers.set-cookie',
        ],
        censor: '[REDACTED]',
      },
      // Strip query strings from logged request URLs: authorization codes and
      // state values must not end up in logs.
      serializers: {
        req(request) {
          const serialized: Record<string, unknown> = {
            method: request.method,
            url: new URL(request.url ?? '/', 'http://log.invalid').pathname,
          };
          const remoteAddress = request.socket?.remoteAddress;
          if (remoteAddress !== undefined) {
            serialized.remoteAddress = remoteAddress;
          }
          return serialized;
        },
      },
    },
    trustProxy: false,
  });

  // Cookie parsing (request.cookies / reply.setCookie / clearCookie).
  await app.register(cookie);

  // Per-route rate limiting (auth routes opt in via route config).
  await app.register(rateLimit, { global: false });

  await registerErrorHandler(app);

  // request.auth decoration used by the auth guards.
  decorateRequestsWithAuth(app);

  // Exact allowed-Origin validation for state-changing requests.
  await registerHttpSecurity(app);

  await registerAuthRoutes(app);
  await registerEmployeeRoutes(app);
  await registerLeaveRoutes(app);
  await registerDailyUpdateRoutes(app);
  await registerHolidayRoutes(app);
  await registerAttendanceRoutes(app);
  await registerBreakRoutes(app);
  await registerAnnouncementRoutes(app);
  await registerMeetingRoutes(app);

  // Simple liveness endpoint. Intentionally returns no environment,
  // version, or dependency state details. It does NOT touch Google,
  // Sheets, email, or the database.
  app.get('/health', async () => {
    return { status: 'ok' };
  });

  return app;
}
