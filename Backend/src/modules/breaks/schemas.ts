import { z } from 'zod';
import { AppError } from '../../shared/errors.js';

export const attendanceParamsSchema = z.strictObject({
  attendanceId: z.uuid(),
});

export const breakParamsSchema = z.strictObject({
  attendanceId: z.uuid(),
  breakId: z.uuid(),
});

export const attendanceBreakRecordSchema = z.object({
  id: z.uuid(),
  attendanceId: z.uuid(),
  employeeId: z.uuid(),
  startedAt: z.iso.datetime(),
  endedAt: z.iso.datetime().nullable(),
  durationSeconds: z.number().int().min(0).nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const breakStartResponseSchema = z.object({
  break: attendanceBreakRecordSchema,
});

export const breakEndResponseSchema = z.object({
  break: attendanceBreakRecordSchema,
  durationSeconds: z.number().int().min(0),
});

export const breakListResponseSchema = z.object({
  breaks: z.array(attendanceBreakRecordSchema),
  totalBreakDurationSeconds: z.number().int().min(0),
  activeBreak: attendanceBreakRecordSchema.nullable(),
});

export const breakStartResponseJsonSchema = z.toJSONSchema(breakStartResponseSchema);
export const breakEndResponseJsonSchema = z.toJSONSchema(breakEndResponseSchema);
export const breakListResponseJsonSchema = z.toJSONSchema(breakListResponseSchema);

export function parseBreakRequest<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new AppError('Invalid request', 400);
  return parsed.data;
}

export type AttendanceParams = z.infer<typeof attendanceParamsSchema>;
export type BreakParams = z.infer<typeof breakParamsSchema>;
export type AttendanceBreakRecord = z.infer<typeof attendanceBreakRecordSchema>;
