import type { FastifyInstance } from 'fastify';
import { AppError, UnimplementedError } from '../shared/errors.js';

const GENERIC_500_MESSAGE = 'Internal server error';

/**
 * Central error handling:
 * - Known client errors (AppError / Fastify HTTP errors) keep their status and
 *   message.
 * - Anything else (including our UnimplementedError stubs) is logged internally
 *   and answered with a generic message that hides internal details.
 */
export async function registerErrorHandler(app: FastifyInstance): Promise<void> {
  app.setErrorHandler((error, request, reply) => {
    // Authentication responses (including their errors) must never be cached.
    const requestPath = request.url.split('?')[0] ?? request.url;
    if (requestPath.startsWith('/auth')) {
      void reply.header('cache-control', 'no-store');
    }

    if (error instanceof AppError) {
      void reply.status(error.statusCode).send({
        statusCode: error.statusCode,
        error: error.name,
        message: error.message,
      });
      return;
    }

    if (error instanceof UnimplementedError) {
      void reply.status(error.statusCode).send({
        statusCode: error.statusCode,
        error: 'NotImplemented',
        message: error.message,
      });
      return;
    }

    const statusCode = typeof (error as { statusCode?: unknown }).statusCode === 'number'
      ? (error as { statusCode: number }).statusCode
      : 500;

    if (statusCode >= 500) {
      request.log.error({ err: error }, 'Unhandled request error');
      void reply.status(500).send({
        statusCode: 500,
        error: 'Internal Server Error',
        message: GENERIC_500_MESSAGE,
      });
      return;
    }

    // Client error raised by the framework (validation, 404, 415, ...).
    const message = error instanceof Error ? error.message : 'Request rejected';
    const name = error instanceof Error ? error.name : 'Error';
    request.log.info({ err: error }, 'Request rejected');
    void reply.status(statusCode).send({
      statusCode,
      error: name,
      message,
    });
  });

  app.setNotFoundHandler((request, reply) => {
    void reply.status(404).send({
      statusCode: 404,
      error: 'Not Found',
      message: `Route ${request.method} ${request.url} not found`,
    });
  });
}
