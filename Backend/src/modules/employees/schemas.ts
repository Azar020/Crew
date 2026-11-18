import { z } from 'zod';
import { ALLOWED_EMAIL_DOMAINS } from '../auth/constants.js';
import { AppError } from '../../shared/errors.js';
import { ianaTimezoneSchema } from '../../shared/timezone.js';

const nameSchema = z.string().trim().min(1).max(200);
const roleSchema = z.enum(['admin', 'employee']);
const emailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email())
  .refine((email) => (ALLOWED_EMAIL_DOMAINS as readonly string[])
    .includes(email.split('@')[1] ?? ''), 'Company email required');

const departmentSchema = z.string().trim().min(1).max(100);
const designationSchema = z.string().trim().min(1).max(100);
const phoneSchema = z.string().trim().min(1).max(30);
const addressSchema = z.string().trim().min(1).max(500);

export const selfProfilePatchSchema = z.strictObject({
  name: nameSchema.optional(),
  phoneNumber: phoneSchema.nullable().optional(),
  address: addressSchema.nullable().optional(),
  designation: designationSchema.nullable().optional(),
}).refine((patch) => Object.keys(patch).length > 0, 'At least one field required');

export const createEmployeeSchema = z.strictObject({
  name: nameSchema,
  email: emailSchema,
  // Required at provisioning; attendance stays blocked until it is set.
  timezone: ianaTimezoneSchema,
  department: departmentSchema.optional(),
  designation: designationSchema.optional(),
  phoneNumber: phoneSchema.optional(),
  address: addressSchema.optional(),
});

export const employeePatchSchema = z.strictObject({
  name: nameSchema.optional(),
  email: emailSchema.optional(),
  isActive: z.boolean().optional(),
  // Admin-only timezone change; self-service never sees this field.
  timezone: ianaTimezoneSchema.optional(),
  department: departmentSchema.nullable().optional(),
  designation: designationSchema.nullable().optional(),
  phoneNumber: phoneSchema.nullable().optional(),
  address: addressSchema.nullable().optional(),
}).refine((patch) => Object.keys(patch).length > 0, 'At least one field required');

export const employeeRolePatchSchema = z.strictObject({ role: roleSchema });
export const employeeParamsSchema = z.strictObject({ id: z.uuid() });
const integerQuery = (min: number, max: number, fallback: number) =>
  z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(min).max(max))
    .default(fallback);

export const employeeListQuerySchema = z.strictObject({
  limit: integerQuery(1, 100, 20),
  offset: integerQuery(0, 1_000_000, 0),
  search: z.string().trim().min(1).max(100).optional(),
  department: z.string().trim().min(1).max(100).optional(),
  role: roleSchema.optional(),
  isActive: z.enum(['true', 'false']).transform((value) => value === 'true').optional(),
});

// Deliberate allowlist: never derive this from a table or an input schema.
export const employeeProfileSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  email: z.string(),
  role: roleSchema,
  isActive: z.boolean(),
  // Nullable for employees provisioned before timezones existed; attendance
  // stays blocked until an admin sets it.
  timezone: z.string().nullable(),
  department: z.string().nullable().optional(),
  designation: z.string().nullable().optional(),
  phoneNumber: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  identityBound: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const employeeResponseSchema = z.object({ employee: employeeProfileSchema });
export const employeeListResponseSchema = z.object({
  employees: z.array(employeeProfileSchema),
  limit: z.number().int(),
  offset: z.number().int(),
});
export const employeeResponseJsonSchema = z.toJSONSchema(employeeResponseSchema);
export const employeeListResponseJsonSchema = z.toJSONSchema(employeeListResponseSchema);

export function parseInput<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new AppError('Invalid employee request', 400);
  return result.data;
}

export type CreateEmployee = z.infer<typeof createEmployeeSchema>;
export type EmployeePatch = z.infer<typeof employeePatchSchema>;
export type SelfProfilePatch = z.infer<typeof selfProfilePatchSchema>;
export type EmployeeListQuery = z.infer<typeof employeeListQuerySchema>;
export type EmployeeProfile = z.infer<typeof employeeProfileSchema>;
