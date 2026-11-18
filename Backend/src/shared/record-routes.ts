import type { FastifyInstance, FastifyRequest } from 'fastify';
import { requireAuth } from '../modules/auth/guards.js';
import { AppError } from './errors.js';
import { safeRecordError } from './record-access.js';

export const recordBodyLimit = 64 * 1024;
export const recordReadConfig = { rateLimit: { max: 120, timeWindow: '1 minute' } };
export const recordWriteConfig = { rateLimit: { max: 30, timeWindow: '1 minute' } };

export function requestActor(request: FastifyRequest) {
  if (!request.auth) throw new AppError('Authentication required', 401);
  return request.auth;
}

/** Install real hooks inside each encapsulated scope, including privacy on errors. */
export function registerRecordHooks(scope: FastifyInstance): void {
  scope.addHook('onRequest', async (_request, reply) => { reply.header('cache-control', 'no-store'); });
  scope.addHook('preHandler', requireAuth);
  scope.setErrorHandler((error) => {
    if (error instanceof AppError) throw error;
    const status = (error as { statusCode?: number }).statusCode;
    // Parser messages may echo malformed JSON containing reasons/work content.
    // Framework errors never reach the parent logger with their raw messages.
    if (status !== undefined && status >= 400 && status < 500) {
      if (status === 413) throw new AppError('Request body too large', 413);
      if (status === 429) throw new AppError('Too many requests', 429);
      throw new AppError('Invalid request', status);
    }
    throw safeRecordError(error);
  });
}
