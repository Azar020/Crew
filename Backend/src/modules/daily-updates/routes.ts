import type { FastifyInstance } from 'fastify';
import { requireCsrf } from '../auth/guards.js';
import { parseRequest, recordIdParamsSchema } from '../../shared/record-schemas.js';
import { recordBodyLimit, recordReadConfig, recordWriteConfig, registerRecordHooks, requestActor } from '../../shared/record-routes.js';
import { createDailyUpdate, listDailyUpdates, patchDailyUpdate } from './service.js';
import {
  createDailyUpdateSchema, dailyUpdateListQuerySchema, dailyUpdateListResponseJsonSchema,
  dailyUpdateResponseJsonSchema, patchDailyUpdateSchema,
} from './schemas.js';

export async function registerDailyUpdateRoutes(app: FastifyInstance): Promise<void> {
  await app.register(async (scope) => {
    registerRecordHooks(scope);
    scope.post('/daily-updates', {
      preHandler: [requireCsrf], bodyLimit: recordBodyLimit, config: recordWriteConfig,
      schema: { response: { 201: dailyUpdateResponseJsonSchema } },
    }, async (request, reply) => {
      const dailyUpdate = await createDailyUpdate(requestActor(request), parseRequest(createDailyUpdateSchema, request.body));
      return reply.status(201).send({ dailyUpdate });
    });
    scope.patch('/daily-updates/:id', {
      preHandler: [requireCsrf], bodyLimit: recordBodyLimit, config: recordWriteConfig,
      schema: { response: { 200: dailyUpdateResponseJsonSchema } },
    }, async (request) => ({ dailyUpdate: await patchDailyUpdate(requestActor(request),
      parseRequest(recordIdParamsSchema, request.params).id,
      parseRequest(patchDailyUpdateSchema, request.body)) }));
    scope.get('/daily-updates', {
      config: recordReadConfig, schema: { response: { 200: dailyUpdateListResponseJsonSchema } },
    }, async (request) => listDailyUpdates(requestActor(request), parseRequest(dailyUpdateListQuerySchema, request.query)));
  });
}
