import type { FastifyInstance } from 'fastify';
import { requireCsrf, requireRole } from '../auth/guards.js';
import {
  recordBodyLimit,
  recordReadConfig,
  recordWriteConfig,
  registerRecordHooks,
  requestActor,
} from '../../shared/record-routes.js';
import {
  cancelMeeting,
  completeMeeting,
  createMeeting,
  deleteMeeting,
  getMeeting,
  listMeetings,
  updateMeeting,
} from './service.js';
import {
  createMeetingSchema,
  meetingListQuerySchema,
  meetingListResponseJsonSchema,
  meetingParamsSchema,
  meetingResponseJsonSchema,
  parseMeetingInput,
  patchMeetingSchema,
} from './schemas.js';

export async function registerMeetingRoutes(app: FastifyInstance): Promise<void> {
  await app.register(async (scope) => {
    registerRecordHooks(scope);
    const admin = requireRole('admin');

    // Admin: Schedule meeting
    scope.post('/meetings', {
      preHandler: [admin, requireCsrf],
      bodyLimit: recordBodyLimit,
      config: recordWriteConfig,
      schema: { response: { 201: meetingResponseJsonSchema } },
    }, async (request, reply) => {
      const meeting = await createMeeting(
        requestActor(request),
        parseMeetingInput(createMeetingSchema, request.body),
      );
      return reply.status(201).send({ meeting });
    });

    // Admin: Edit meeting
    scope.patch('/meetings/:id', {
      preHandler: [admin, requireCsrf],
      bodyLimit: recordBodyLimit,
      config: recordWriteConfig,
      schema: { response: { 200: meetingResponseJsonSchema } },
    }, async (request) => ({
      meeting: await updateMeeting(
        requestActor(request),
        parseMeetingInput(meetingParamsSchema, request.params).id,
        parseMeetingInput(patchMeetingSchema, request.body),
      ),
    }));

    // Admin: Cancel meeting
    scope.patch('/meetings/:id/cancel', {
      preHandler: [admin, requireCsrf],
      bodyLimit: recordBodyLimit,
      config: recordWriteConfig,
      schema: { response: { 200: meetingResponseJsonSchema } },
    }, async (request) => ({
      meeting: await cancelMeeting(
        requestActor(request),
        parseMeetingInput(meetingParamsSchema, request.params).id,
      ),
    }));

    // Admin: Complete meeting
    scope.patch('/meetings/:id/complete', {
      preHandler: [admin, requireCsrf],
      bodyLimit: recordBodyLimit,
      config: recordWriteConfig,
      schema: { response: { 200: meetingResponseJsonSchema } },
    }, async (request) => ({
      meeting: await completeMeeting(
        requestActor(request),
        parseMeetingInput(meetingParamsSchema, request.params).id,
      ),
    }));

    // Admin: Delete meeting
    scope.delete('/meetings/:id', {
      preHandler: [admin, requireCsrf],
      config: recordWriteConfig,
    }, async (request) => {
      return deleteMeeting(
        requestActor(request),
        parseMeetingInput(meetingParamsSchema, request.params).id,
      );
    });

    // Employees & Admin: List meetings
    scope.get('/meetings', {
      config: recordReadConfig,
      schema: { response: { 200: meetingListResponseJsonSchema } },
    }, async (request) => listMeetings(
      requestActor(request),
      parseMeetingInput(meetingListQuerySchema, request.query),
    ));

    // Employees & Admin: View single meeting
    scope.get('/meetings/:id', {
      config: recordReadConfig,
      schema: { response: { 200: meetingResponseJsonSchema } },
    }, async (request) => ({
      meeting: await getMeeting(
        requestActor(request),
        parseMeetingInput(meetingParamsSchema, request.params).id,
      ),
    }));
  });
}
