import { z } from 'zod';
import { AppError } from '../../shared/errors.js';

export const ANNOUNCEMENT_STATUSES = ['draft', 'published', 'archived'] as const;
export const announcementStatusSchema = z.enum(ANNOUNCEMENT_STATUSES);
export type AnnouncementStatus = z.infer<typeof announcementStatusSchema>;

export const createAnnouncementSchema = z.strictObject({
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1).max(10_000),
  status: z.enum(['draft', 'published']).default('draft'),
});

export const patchAnnouncementSchema = z.strictObject({
  title: z.string().trim().min(1).max(200).optional(),
  content: z.string().trim().min(1).max(10_000).optional(),
  status: announcementStatusSchema.optional(),
}).refine((data) => Object.keys(data).length > 0, 'At least one field required');

export const announcementParamsSchema = z.strictObject({ id: z.uuid() });

const integerQuery = (min: number, max: number, fallback: number) =>
  z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(min).max(max))
    .default(fallback);

export const announcementListQuerySchema = z.strictObject({
  limit: integerQuery(1, 100, 20),
  offset: integerQuery(0, 1_000_000, 0),
  status: announcementStatusSchema.optional(),
});

export const announcementAuthorSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  email: z.string(),
});

export const announcementSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  content: z.string(),
  status: announcementStatusSchema,
  publishedAt: z.iso.datetime().nullable(),
  createdBy: z.uuid(),
  author: announcementAuthorSchema.optional(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const announcementResponseSchema = z.object({ announcement: announcementSchema });
export const announcementListResponseSchema = z.object({
  announcements: z.array(announcementSchema),
  limit: z.number().int(),
  offset: z.number().int(),
});

export const announcementResponseJsonSchema = z.toJSONSchema(announcementResponseSchema);
export const announcementListResponseJsonSchema = z.toJSONSchema(announcementListResponseSchema);

export function parseAnnouncementInput<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new AppError('Invalid announcement request', 400);
  return result.data;
}

export type CreateAnnouncement = z.infer<typeof createAnnouncementSchema>;
export type PatchAnnouncement = z.infer<typeof patchAnnouncementSchema>;
export type AnnouncementListQuery = z.infer<typeof announcementListQuerySchema>;
export type AnnouncementData = z.infer<typeof announcementSchema>;
