import type { FastifyInstance, FastifyRequest } from 'fastify';
import { requireAuth, requireCsrf, requireRole } from '../auth/guards.js';
import { AppError } from '../../shared/errors.js';
import {
  changeEmployeeRole, createEmployee, getEmployeeProfile, listEmployees,
  updateEmployee, updateSelfProfile,
} from './service.js';
import {
  createEmployeeSchema, employeeListQuerySchema, employeeListResponseJsonSchema,
  employeeParamsSchema, employeePatchSchema, employeeResponseJsonSchema,
  employeeRolePatchSchema, parseInput, selfProfilePatchSchema,
} from './schemas.js';

function actor(request: FastifyRequest) {
  if (!request.auth) throw new AppError('Authentication required', 401);
  return request.auth;
}

export async function registerEmployeeRoutes(app: FastifyInstance): Promise<void> {
  await app.register(async (scope) => {
    scope.addHook('onRequest', async (_request, reply) => {
      reply.header('cache-control', 'no-store');
    });
    scope.addHook('preHandler', requireAuth);
    const response = { 200: employeeResponseJsonSchema };
    const admin = requireRole('admin');

    // Static routes take precedence over /:id; ownership is session-derived.
    scope.get('/employees/me', { schema: { response } }, async (request) => ({
      employee: await getEmployeeProfile(actor(request)),
    }));
    scope.patch('/employees/me', {
      preHandler: [requireCsrf], schema: { response },
    }, async (request) => ({
      employee: await updateSelfProfile(actor(request), parseInput(selfProfilePatchSchema, request.body)),
    }));
    scope.get('/employees', {
      preHandler: [admin], schema: { response: { 200: employeeListResponseJsonSchema } },
    }, async (request) => listEmployees(actor(request), parseInput(employeeListQuerySchema, request.query)));
    scope.get('/employees/:id', {
      preHandler: [admin], schema: { response },
    }, async (request) => ({
      employee: await getEmployeeProfile(actor(request), parseInput(employeeParamsSchema, request.params).id, true),
    }));
    scope.post('/employees', {
      preHandler: [admin, requireCsrf], schema: { response: { 201: employeeResponseJsonSchema } },
    }, async (request, reply) => {
      const employee = await createEmployee(actor(request), parseInput(createEmployeeSchema, request.body));
      return reply.status(201).send({ employee });
    });
    scope.patch('/employees/:id', {
      preHandler: [admin, requireCsrf], schema: { response },
    }, async (request) => ({
      employee: await updateEmployee(actor(request), parseInput(employeeParamsSchema, request.params).id,
        parseInput(employeePatchSchema, request.body)),
    }));
    scope.patch('/employees/:id/role', {
      preHandler: [admin, requireCsrf], schema: { response },
    }, async (request) => ({
      employee: await changeEmployeeRole(actor(request), parseInput(employeeParamsSchema, request.params).id,
        parseInput(employeeRolePatchSchema, request.body).role),
    }));
  });
}
