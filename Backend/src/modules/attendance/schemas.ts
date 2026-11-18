import { z } from 'zod';
import { calendarDateSchema } from '../../shared/calendar.js';
import { paginationShape, paginationResponseShape } from '../../shared/record-schemas.js';

const attendanceRecordSchema = z.object({
  id: z.uuid(), employeeId: z.uuid(), workDate: calendarDateSchema,
  timezoneAtCheckIn: z.string(), checkedInAt: z.iso.datetime(),
  checkedOutAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(),
});
export const attendanceResponseJsonSchema = z.toJSONSchema(z.object({ attendance: attendanceRecordSchema }));
export const checkOutResponseJsonSchema = z.toJSONSchema(z.object({
  attendance: attendanceRecordSchema,
  // Derived from the two timestamps at response time; never stored.
  sessionDurationSeconds: z.number().int().min(0),
}));
export const attendanceStatusResponseJsonSchema = z.toJSONSchema(z.object({
  timezone: z.string().nullable(),
  localDate: calendarDateSchema.nullable(),
  state: z.enum(['not_checked_in', 'checked_in', 'checked_out']),
  canCheckIn: z.boolean(),
  canCheckOut: z.boolean(),
  openSession: attendanceRecordSchema.nullable(),
  todayCompletedRecord: attendanceRecordSchema.nullable(),
}));
export const attendanceListResponseJsonSchema = z.toJSONSchema(z.object({
  attendance: z.array(attendanceRecordSchema), ...paginationResponseShape,
}));

const dateRangeFilters = {
  fromDate: calendarDateSchema.optional(),
  toDate: calendarDateSchema.optional(),
};
const orderedRange = (query: { fromDate?: string | undefined; toDate?: string | undefined }) =>
  !query.fromDate || !query.toDate || query.fromDate <= query.toDate;
export const attendanceListQuerySchema = z.strictObject({
  ...paginationShape, ...dateRangeFilters,
}).refine(orderedRange, 'fromDate must not follow toDate');
export const attendanceAdminListQuerySchema = z.strictObject({
  ...paginationShape, ...dateRangeFilters, employeeId: z.uuid().optional(),
}).refine(orderedRange, 'fromDate must not follow toDate');
export type AttendanceListQuery = z.infer<typeof attendanceListQuerySchema>;
export type AttendanceAdminListQuery = z.infer<typeof attendanceAdminListQuerySchema>;
