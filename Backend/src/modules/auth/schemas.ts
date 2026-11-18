import { z } from 'zod';

/**
 * Input/response validation for the authentication boundary.
 * These schemas validate request shapes only; all security decisions are
 * made in service.ts/guards.ts from database state.
 */

/** Query parameters Google may append to /auth/callback. */
export const loginCallbackQuerySchema = z.object({
  code: z.string().min(1).max(2048).optional(),
  state: z.string().min(1).max(512).optional(),
  error: z.string().min(1).max(512).optional(),
});

/** Response of GET /auth/me (Cache-Control: no-store). */
export const meResponseSchema = z.object({
  employee: z.object({
    id: z.string().uuid(),
    email: z.string(),
    name: z.string(),
    role: z.enum(['admin', 'employee']),
  }),
});

/** Response of GET /auth/csrf (Cache-Control: no-store). */
export const csrfResponseSchema = z.object({
  csrfToken: z.string().min(32),
});
