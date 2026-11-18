import type { FastifyInstance } from 'fastify';
import { requireCsrf, requireRole } from '../auth/guards.js';
import { parseRequest, recordIdParamsSchema } from '../../shared/record-schemas.js';
import {
  recordBodyLimit,
  recordReadConfig,
  recordWriteConfig,
  registerRecordHooks,
  requestActor,
} from '../../shared/record-routes.js';
import {
  createLeaveRequest,
  getLeaveRequest,
  listLeaveRequests,
  patchLeaveRequest,
  reviewLeaveRequest,
} from './service.js';
import {
  createLeaveRequestSchema,
  leaveListQuerySchema,
  leaveListResponseJsonSchema,
  leaveResponseJsonSchema,
  patchLeaveRequestSchema,
  rejectLeaveRequestSchema,
  reviewLeaveRequestSchema,
} from './schemas.js';

export async function registerLeaveRoutes(app: FastifyInstance): Promise<void> {
  await app.register(async (scope) => {
    registerRecordHooks(scope);

    // Employee: Submit leave request
    scope.post('/leave-requests', {
      preHandler: [requireCsrf],
      bodyLimit: recordBodyLimit,
      config: recordWriteConfig,
      schema: { response: { 201: leaveResponseJsonSchema } },
    }, async (request, reply) => {
      const leaveRequest = await createLeaveRequest(
        requestActor(request),
        parseRequest(createLeaveRequestSchema, request.body),
      );
      return reply.status(201).send({ leaveRequest });
    });

    // Employee: Partial edit (only while pending)
    scope.patch('/leave-requests/:id', {
      preHandler: [requireCsrf],
      bodyLimit: recordBodyLimit,
      config: recordWriteConfig,
      schema: { response: { 200: leaveResponseJsonSchema } },
    }, async (request) => ({
      leaveRequest: await patchLeaveRequest(
        requestActor(request),
        parseRequest(recordIdParamsSchema, request.params).id,
        parseRequest(patchLeaveRequestSchema, request.body),
      ),
    }));

    // Employee & Admin: View single leave request details
    scope.get('/leave-requests/:id', {
      config: recordReadConfig,
      schema: { response: { 200: leaveResponseJsonSchema } },
    }, async (request) => ({
      leaveRequest: await getLeaveRequest(
        requestActor(request),
        parseRequest(recordIdParamsSchema, request.params).id,
      ),
    }));

    // Employee & Admin: List leave requests with filters (scope, status, employeeId, dates)
    scope.get('/leave-requests', {
      config: recordReadConfig,
      schema: { response: { 200: leaveListResponseJsonSchema } },
    }, async (request) => listLeaveRequests(
      requestActor(request),
      parseRequest(leaveListQuerySchema, request.query),
    ));

    // Admin: Approve pending leave request
    scope.patch('/leave-requests/:id/approve', {
      preHandler: [requireRole('admin'), requireCsrf],
      bodyLimit: recordBodyLimit,
      config: recordWriteConfig,
      schema: { response: { 200: leaveResponseJsonSchema } },
    }, async (request) => ({
      leaveRequest: await reviewLeaveRequest(
        requestActor(request),
        parseRequest(recordIdParamsSchema, request.params).id,
        { status: 'approved' },
      ),
    }));

    // Admin: Reject pending leave request (requires mandatory reason)
    scope.patch('/leave-requests/:id/reject', {
      preHandler: [requireRole('admin'), requireCsrf],
      bodyLimit: recordBodyLimit,
      config: recordWriteConfig,
      schema: { response: { 200: leaveResponseJsonSchema } },
    }, async (request) => {
      const body = parseRequest(rejectLeaveRequestSchema, request.body);
      const rejectionReason = (body.reason ?? body.rejectionReason)!.trim();
      return {
        leaveRequest: await reviewLeaveRequest(
          requestActor(request),
          parseRequest(recordIdParamsSchema, request.params).id,
          { status: 'rejected', rejectionReason },
        ),
      };
    });

    // Admin: Generic review / status endpoint
    for (const path of ['/leave-requests/:id/review', '/leave-requests/:id/status']) {
      scope.patch(path, {
        preHandler: [requireRole('admin'), requireCsrf],
        bodyLimit: recordBodyLimit,
        config: recordWriteConfig,
        schema: { response: { 200: leaveResponseJsonSchema } },
      }, async (request) => {
        const body = parseRequest(reviewLeaveRequestSchema, request.body);
        const rejectionReason = (body.reason ?? body.rejectionReason)?.trim();
        return {
          leaveRequest: await reviewLeaveRequest(
            requestActor(request),
            parseRequest(recordIdParamsSchema, request.params).id,
            { status: body.status, rejectionReason },
          ),
        };
      });
    }
  });
}
