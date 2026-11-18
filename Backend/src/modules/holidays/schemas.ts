import { z } from 'zod';
import { calendarDateSchema, companyDate } from '../../shared/calendar.js';
import { paginationResponseShape, paginationShape } from '../../shared/record-schemas.js';

export const createHolidaySchema = z.strictObject({
  name: z.string().trim().min(1).max(200), date: calendarDateSchema,
});

/** Partial edit: at least one field, null/blank rejected, omitted fields unchanged. */
export const patchHolidaySchema = z.strictObject({
  name: z.string().trim().min(1).max(200).optional(),
  date: calendarDateSchema.optional(),
}).refine((patch) => Object.keys(patch).length > 0, 'At least one field required');
export const holidayListQuerySchema = z.strictObject({
  ...paginationShape,
  year: z.string().regex(/^\d{4}$/).transform(Number).pipe(z.number().int().min(1).max(9999))
    .default(() => Number(companyDate().slice(0, 4))),
});
const holidaySchema = z.object({
  id: z.uuid(), name: z.string(), date: calendarDateSchema,
  createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(),
});
export const holidayResponseJsonSchema = z.toJSONSchema(z.object({ holiday: holidaySchema }));
export const holidayListResponseJsonSchema = z.toJSONSchema(z.object({
  holidays: z.array(holidaySchema), ...paginationResponseShape,
}));
export type CreateHoliday = z.infer<typeof createHolidaySchema>;
export type PatchHoliday = z.infer<typeof patchHolidaySchema>;
export type HolidayListQuery = z.infer<typeof holidayListQuerySchema>;
