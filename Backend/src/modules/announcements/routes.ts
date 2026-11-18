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
  archiveAnnouncement,
  createAnnouncement,
  deleteAnnouncement,
  getAnnouncement,
  listAnnouncements,
  publishAnnouncement,
  updateAnnouncement,
} from './service.js';
import {
  announcementListQuerySchema,
  announcementListResponseJsonSchema,
  announcementParamsSchema,
  announcementResponseJsonSchema,
  createAnnouncementSchema,
  parseAnnouncementInput,
  patchAnnouncementSchema,
} from './schemas.js';

export async function registerAnnouncementRoutes(app: FastifyInstance): Promise<void> {
  await app.register(async (scope) => {
    registerRecordHooks(scope);
    const admin = requireRole('admin');

    // Admin: Create announcement
    scope.post('/announcements', {
      preHandler: [admin, requireCsrf],
      bodyLimit: recordBodyLimit,
      config: recordWriteConfig,
      schema: { response: { 201: announcementResponseJsonSchema } },
    }, async (request, reply) => {
      const announcement = await createAnnouncement(
        requestActor(request),
        parseAnnouncementInput(createAnnouncementSchema, request.body),
      );
      return reply.status(201).send({ announcement });
    });

    // Admin: Edit announcement
    scope.patch('/announcements/:id', {
      preHandler: [admin, requireCsrf],
      bodyLimit: recordBodyLimit,
      config: recordWriteConfig,
      schema: { response: { 200: announcementResponseJsonSchema } },
    }, async (request) => ({
      announcement: await updateAnnouncement(
        requestActor(request),
        parseAnnouncementInput(announcementParamsSchema, request.params).id,
        parseAnnouncementInput(patchAnnouncementSchema, request.body),
      ),
    }));

    // Admin: Publish announcement
    scope.patch('/announcements/:id/publish', {
      preHandler: [admin, requireCsrf],
      bodyLimit: recordBodyLimit,
      config: recordWriteConfig,
      schema: { response: { 200: announcementResponseJsonSchema } },
    }, async (request) => ({
      announcement: await publishAnnouncement(
        requestActor(request),
        parseAnnouncementInput(announcementParamsSchema, request.params).id,
      ),
    }));

    // Admin: Archive announcement
    scope.patch('/announcements/:id/archive', {
      preHandler: [admin, requireCsrf],
      bodyLimit: recordBodyLimit,
      config: recordWriteConfig,
      schema: { response: { 200: announcementResponseJsonSchema } },
    }, async (request) => ({
      announcement: await archiveAnnouncement(
        requestActor(request),
        parseAnnouncementInput(announcementParamsSchema, request.params).id,
      ),
    }));

    // Admin: Delete announcement
    scope.delete('/announcements/:id', {
      preHandler: [admin, requireCsrf],
      config: recordWriteConfig,
    }, async (request) => {
      return deleteAnnouncement(
        requestActor(request),
        parseAnnouncementInput(announcementParamsSchema, request.params).id,
      );
    });

    // Employees & Admin: List announcements (employees get published only; admin can filter)
    scope.get('/announcements', {
      config: recordReadConfig,
      schema: { response: { 200: announcementListResponseJsonSchema } },
    }, async (request) => listAnnouncements(
      requestActor(request),
      parseAnnouncementInput(announcementListQuerySchema, request.query),
    ));

    // Employees & Admin: View single announcement (employees get 404 for draft/archived)
    scope.get('/announcements/:id', {
      config: recordReadConfig,
      schema: { response: { 200: announcementResponseJsonSchema } },
    }, async (request) => ({
      announcement: await getAnnouncement(
        requestActor(request),
        parseAnnouncementInput(announcementParamsSchema, request.params).id,
      ),
    }));
  });
}
