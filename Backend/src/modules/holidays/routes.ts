import type { FastifyInstance } from 'fastify';
import { requireCsrf, requireRole } from '../auth/guards.js';
import { AppError } from '../../shared/errors.js';
import { parseRequest, recordIdParamsSchema } from '../../shared/record-schemas.js';
import { recordBodyLimit, recordReadConfig, recordWriteConfig, registerRecordHooks, requestActor } from '../../shared/record-routes.js';
import { listHolidays, createHoliday, patchHoliday, removeHoliday } from './service.js';
import {
  createHolidaySchema, holidayListQuerySchema, holidayListResponseJsonSchema,
  holidayResponseJsonSchema, patchHolidaySchema,
} from './schemas.js';

export async function registerHolidayRoutes(app: FastifyInstance): Promise<void> {
  await app.register(async (scope) => {
    registerRecordHooks(scope);
    const adminMutation = [requireRole('admin'), requireCsrf];
    scope.get('/holidays', {
      config: recordReadConfig, schema: { response: { 200: holidayListResponseJsonSchema } },
    }, async (request) => listHolidays(requestActor(request), parseRequest(holidayListQuerySchema, request.query)));
    scope.post('/holidays', {
      preHandler: adminMutation, bodyLimit: recordBodyLimit, config: recordWriteConfig,
      schema: { response: { 201: holidayResponseJsonSchema } },
    }, async (request, reply) => {
      const holiday = await createHoliday(requestActor(request), parseRequest(createHolidaySchema, request.body));
      return reply.status(201).send({ holiday });
    });
    scope.patch('/holidays/:id', {
      preHandler: adminMutation, bodyLimit: recordBodyLimit, config: recordWriteConfig,
      schema: { response: { 200: holidayResponseJsonSchema } },
    }, async (request) => ({ holiday: await patchHoliday(requestActor(request),
      parseRequest(recordIdParamsSchema, request.params).id, parseRequest(patchHolidaySchema, request.body)) }));
    scope.delete('/holidays/:id', {
      preHandler: adminMutation, bodyLimit: recordBodyLimit, config: recordWriteConfig,
    }, async (request, reply) => {
      if (request.body !== undefined) throw new AppError('DELETE does not accept a body', 400);
      await removeHoliday(requestActor(request), parseRequest(recordIdParamsSchema, request.params).id);
      return reply.status(204).send();
    });
  });
}
