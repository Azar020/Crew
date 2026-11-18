import { z } from 'zod';
import { AppError } from './errors.js';
import { calendarDateSchema } from './calendar.js';

export function parseRequest<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new AppError('Invalid request', 400);
  return parsed.data;
}

export const paginationShape = {
  limit: z.string().regex(/^\d{1,3}$/).transform(Number).pipe(z.number().int().min(1).max(100)).default(20),
  offset: z.string().regex(/^\d{1,7}$/).transform(Number).pipe(z.number().int().min(0).max(1_000_000)).default(0),
};
export const recordListQuerySchema = z.strictObject({
  ...paginationShape,
  scope: z.enum(['mine', 'me', 'all']).transform((s) => (s === 'me' ? 'mine' : s)).default('mine'),
  employeeId: z.uuid().optional(),
  fromDate: calendarDateSchema.optional(),
  toDate: calendarDateSchema.optional(),
}).refine((query) => !query.fromDate || !query.toDate || query.fromDate <= query.toDate,
  'fromDate must not follow toDate');
export type RecordListQuery = z.infer<typeof recordListQuerySchema>;
export const paginationResponseShape = { limit: z.number().int(), offset: z.number().int() };
export const recordIdParamsSchema = z.strictObject({ id: z.uuid() });
