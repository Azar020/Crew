import { z } from 'zod';
import { AppError } from '../../shared/errors.js';
import { calendarDateSchema } from '../../shared/calendar.js';
import { ianaTimezoneSchema } from '../../shared/timezone.js';

export const MEETING_STATUSES = ['scheduled', 'cancelled', 'completed'] as const;
export const meetingStatusSchema = z.enum(MEETING_STATUSES);
export type MeetingStatus = z.infer<typeof meetingStatusSchema>;

const timeStringSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected HH:mm format');

export const createMeetingSchema = z.strictObject({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(5000).nullable().optional(),
  meetingDate: calendarDateSchema,
  startTime: timeStringSchema,
  endTime: timeStringSchema,
  timezone: ianaTimezoneSchema,
  location: z.string().trim().min(1).max(200).nullable().optional(),
  meetingLink: z.string().trim().min(1).max(500).nullable().optional(),
}).refine((m) => m.endTime > m.startTime, 'endTime must be later than startTime');

export const patchMeetingSchema = z.strictObject({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().min(1).max(5000).nullable().optional(),
  meetingDate: calendarDateSchema.optional(),
  startTime: timeStringSchema.optional(),
  endTime: timeStringSchema.optional(),
  timezone: ianaTimezoneSchema.optional(),
  location: z.string().trim().min(1).max(200).nullable().optional(),
  meetingLink: z.string().trim().min(1).max(500).nullable().optional(),
  status: meetingStatusSchema.optional(),
}).refine((data) => Object.keys(data).length > 0, 'At least one field required');

export const meetingParamsSchema = z.strictObject({ id: z.uuid() });

const integerQuery = (min: number, max: number, fallback: number) =>
  z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(min).max(max))
    .default(fallback);

export const meetingListQuerySchema = z.strictObject({
  limit: integerQuery(1, 100, 20),
  offset: integerQuery(0, 1_000_000, 0),
  status: meetingStatusSchema.optional(),
  fromDate: calendarDateSchema.optional(),
  toDate: calendarDateSchema.optional(),
}).refine((q) => !q.fromDate || !q.toDate || q.fromDate <= q.toDate, 'fromDate must not follow toDate');

export const meetingOrganizerSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  email: z.string(),
});

export const meetingSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  description: z.string().nullable(),
  meetingDate: calendarDateSchema,
  startTime: z.string(),
  endTime: z.string(),
  timezone: z.string(),
  location: z.string().nullable(),
  meetingLink: z.string().nullable(),
  status: meetingStatusSchema,
  createdBy: z.uuid(),
  organizer: meetingOrganizerSchema.optional(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const meetingResponseSchema = z.object({ meeting: meetingSchema });
export const meetingListResponseSchema = z.object({
  meetings: z.array(meetingSchema),
  limit: z.number().int(),
  offset: z.number().int(),
});

export const meetingResponseJsonSchema = z.toJSONSchema(meetingResponseSchema);
export const meetingListResponseJsonSchema = z.toJSONSchema(meetingListResponseSchema);

export function parseMeetingInput<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new AppError('Invalid meeting request', 400);
  return result.data;
}

export type CreateMeeting = z.infer<typeof createMeetingSchema>;
export type PatchMeeting = z.infer<typeof patchMeetingSchema>;
export type MeetingListQuery = z.infer<typeof meetingListQuerySchema>;
export type MeetingData = z.infer<typeof meetingSchema>;
