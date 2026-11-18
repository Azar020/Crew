import { z } from 'zod';
import { calendarDateSchema } from '../../shared/calendar.js';
import { paginationResponseShape, recordListQuerySchema } from '../../shared/record-schemas.js';

export const createDailyUpdateSchema = z.strictObject({
  workDate: calendarDateSchema,
  content: z.string().trim().min(1).max(5000),
});

/** Partial edit with the same semantics as creation: explicit null/blank values
 * are rejected, omitted fields stay unchanged, and the merged record is validated.
 */
export const patchDailyUpdateSchema = z.strictObject({
  workDate: calendarDateSchema.optional(),
  content: z.string().trim().min(1).max(5000).optional(),
}).refine((patch) => Object.keys(patch).length > 0, 'At least one field required');
// Exact dates use fromDate=toDate; a separate workDate filter is intentionally absent.
export const dailyUpdateListQuerySchema = recordListQuerySchema;
const employeeSummarySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  email: z.string().optional(),
  department: z.string().nullable().optional(),
  designation: z.string().nullable().optional(),
});
const dailyUpdateSchema = z.object({
  id: z.uuid(), employeeId: z.uuid(), workDate: calendarDateSchema,
  content: z.string(), createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(),
  employee: employeeSummarySchema.optional(),
  employeeName: z.string().optional(),
  employeeDepartment: z.string().nullable().optional(),
  employeeDesignation: z.string().nullable().optional(),
});
export const dailyUpdateResponseJsonSchema = z.toJSONSchema(z.object({ dailyUpdate: dailyUpdateSchema }));
export const dailyUpdateListResponseJsonSchema = z.toJSONSchema(z.object({
  dailyUpdates: z.array(dailyUpdateSchema), ...paginationResponseShape,
}));
export type CreateDailyUpdate = z.infer<typeof createDailyUpdateSchema>;
export type PatchDailyUpdate = z.infer<typeof patchDailyUpdateSchema>;
