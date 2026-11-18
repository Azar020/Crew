import type { FastifyInstance } from 'fastify';
import { requireCsrf, requireRole } from '../auth/guards.js';
import { AppError } from '../../shared/errors.js';
import { parseRequest } from '../../shared/record-schemas.js';
import { recordBodyLimit, recordReadConfig, recordWriteConfig, registerRecordHooks, requestActor } from '../../shared/record-routes.js';
import { checkIn, checkOut, getAttendanceStatus, listAttendance, listMyAttendance } from './service.js';
import {
  attendanceAdminListQuerySchema, attendanceListQuerySchema, attendanceListResponseJsonSchema,
  attendanceResponseJsonSchema, attendanceStatusResponseJsonSchema, checkOutResponseJsonSchema,
} from './schemas.js';

export async function registerAttendanceRoutes(app: FastifyInstance): Promise<void> {
  await app.register(async (scope) => {
    registerRecordHooks(scope);
    // Check-in/out take no business input: no body of any kind is accepted,
    // so identity, dates, timezones and timestamps can never be client-supplied.
    scope.post('/attendance/check-in', {
      preHandler: [requireCsrf], bodyLimit: recordBodyLimit, config: recordWriteConfig,
      schema: { response: { 201: attendanceResponseJsonSchema } },
    }, async (request, reply) => {
      if (request.body !== undefined) throw new AppError('This endpoint does not accept a body', 400);
      return reply.status(201).send({ attendance: await checkIn(requestActor(request)) });
    });
    scope.post('/attendance/check-out', {
      preHandler: [requireCsrf], bodyLimit: recordBodyLimit, config: recordWriteConfig,
      schema: { response: { 200: checkOutResponseJsonSchema } },
    }, async (request) => {
      if (request.body !== undefined) throw new AppError('This endpoint does not accept a body', 400);
      return checkOut(requestActor(request));
    });
    scope.get('/attendance/status', {
      config: recordReadConfig, schema: { response: { 200: attendanceStatusResponseJsonSchema } },
    }, async (request) => getAttendanceStatus(requestActor(request)));
    scope.get('/attendance/me', {
      config: recordReadConfig, schema: { response: { 200: attendanceListResponseJsonSchema } },
    }, async (request) => listMyAttendance(requestActor(request),
      parseRequest(attendanceListQuerySchema, request.query)));
    scope.get('/attendance', {
      preHandler: [requireRole('admin')], config: recordReadConfig,
      schema: { response: { 200: attendanceListResponseJsonSchema } },
    }, async (request) => listAttendance(requestActor(request),
      parseRequest(attendanceAdminListQuerySchema, request.query)));
  });
}
