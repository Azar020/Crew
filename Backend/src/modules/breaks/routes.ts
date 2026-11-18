import type { FastifyInstance } from 'fastify';
import { requireCsrf } from '../auth/guards.js';
import { AppError } from '../../shared/errors.js';
import {
  recordBodyLimit,
  recordReadConfig,
  recordWriteConfig,
  registerRecordHooks,
  requestActor,
} from '../../shared/record-routes.js';
import { endBreak, listBreaks, startBreak } from './service.js';
import {
  attendanceParamsSchema,
  breakEndResponseJsonSchema,
  breakListResponseJsonSchema,
  breakParamsSchema,
  breakStartResponseJsonSchema,
  parseBreakRequest,
} from './schemas.js';

export async function registerBreakRoutes(app: FastifyInstance): Promise<void> {
  await app.register(async (scope) => {
    registerRecordHooks(scope);

    // 1. POST /attendance/:attendanceId/breaks/start & /api/attendance/:attendanceId/breaks/start
    const startPaths = [
      '/attendance/:attendanceId/breaks/start',
      '/api/attendance/:attendanceId/breaks/start',
    ];
    for (const path of startPaths) {
      scope.post(path, {
        preHandler: [requireCsrf],
        bodyLimit: recordBodyLimit,
        config: recordWriteConfig,
        schema: { response: { 201: breakStartResponseJsonSchema } },
      }, async (request, reply) => {
        if (request.body !== undefined && (typeof request.body !== 'object' || request.body === null || Object.keys(request.body).length > 0)) {
          throw new AppError('This endpoint does not accept a body', 400);
        }
        const params = parseBreakRequest(attendanceParamsSchema, request.params);
        const result = await startBreak(requestActor(request), params.attendanceId);
        return reply.status(201).send(result);
      });
    }

    // 2. POST /attendance/:attendanceId/breaks/:breakId/end & /api/attendance/:attendanceId/breaks/:breakId/end
    const endPaths = [
      '/attendance/:attendanceId/breaks/:breakId/end',
      '/api/attendance/:attendanceId/breaks/:breakId/end',
    ];
    for (const path of endPaths) {
      scope.post(path, {
        preHandler: [requireCsrf],
        bodyLimit: recordBodyLimit,
        config: recordWriteConfig,
        schema: { response: { 200: breakEndResponseJsonSchema } },
      }, async (request) => {
        if (request.body !== undefined && (typeof request.body !== 'object' || request.body === null || Object.keys(request.body).length > 0)) {
          throw new AppError('This endpoint does not accept a body', 400);
        }
        const params = parseBreakRequest(breakParamsSchema, request.params);
        return endBreak(requestActor(request), params.attendanceId, params.breakId);
      });
    }

    // 3. GET /attendance/:attendanceId/breaks & /api/attendance/:attendanceId/breaks
    const listPaths = [
      '/attendance/:attendanceId/breaks',
      '/api/attendance/:attendanceId/breaks',
    ];
    for (const path of listPaths) {
      scope.get(path, {
        config: recordReadConfig,
        schema: { response: { 200: breakListResponseJsonSchema } },
      }, async (request) => {
        const params = parseBreakRequest(attendanceParamsSchema, request.params);
        return listBreaks(requestActor(request), params.attendanceId);
      });
    }
  });
}
