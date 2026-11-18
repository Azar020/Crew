import { z } from 'zod';
import { calendarDateSchema } from '../../shared/calendar.js';
import { paginationResponseShape, recordListQuerySchema } from '../../shared/record-schemas.js';

export const LEAVE_STATUSES = ['pending', 'approved', 'rejected'] as const;
export const leaveStatusSchema = z.enum(LEAVE_STATUSES);
export type LeaveStatus = z.infer<typeof leaveStatusSchema>;

export const leaveTypeSchema = z.string().trim().min(1).max(50);

export const createLeaveRequestSchema = z.strictObject({
  startDate: calendarDateSchema,
  endDate: calendarDateSchema,
  leaveType: leaveTypeSchema.optional(),
  reason: z.string().trim().min(1).max(2000).optional(),
}).refine((body) => body.endDate >= body.startDate, 'endDate must not precede startDate');

/** Partial edit by request owner. Status cannot be modified by employees.
 * If request is already approved or rejected, service rejects modification.
 */
export const patchLeaveRequestSchema = z.strictObject({
  startDate: calendarDateSchema.optional(),
  endDate: calendarDateSchema.optional(),
  leaveType: leaveTypeSchema.optional(),
  reason: z.string().trim().min(1).max(2000).optional(),
}).refine((patch) => Object.keys(patch).length > 0, 'At least one field required');

export const rejectLeaveRequestSchema = z.strictObject({
  reason: z.string().trim().min(1, 'Rejection reason is required').max(2000).optional(),
  rejectionReason: z.string().trim().min(1, 'Rejection reason is required').max(2000).optional(),
}).refine((data) => {
  const val = data.reason ?? data.rejectionReason;
  return typeof val === 'string' && val.trim().length > 0;
}, { message: 'Rejection reason is required' });

export const reviewLeaveRequestSchema = z.strictObject({
  status: z.enum(['approved', 'rejected']),
  reason: z.string().trim().min(1).max(2000).optional(),
  rejectionReason: z.string().trim().min(1).max(2000).optional(),
}).refine((data) => {
  if (data.status === 'rejected') {
    const val = data.reason ?? data.rejectionReason;
    return typeof val === 'string' && val.trim().length > 0;
  }
  return true;
}, { message: 'Rejection reason is required' });

export const leaveListQuerySchema = recordListQuerySchema.extend({
  status: leaveStatusSchema.optional(),
});

export const leaveEmployeeSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  email: z.string(),
});

export const leaveRequestSchema = z.object({
  id: z.uuid(),
  employeeId: z.uuid(),
  startDate: calendarDateSchema,
  endDate: calendarDateSchema,
  reason: z.string().nullable(),
  status: leaveStatusSchema.optional(),
  leaveType: z.string().optional(),
  rejectionReason: z.string().nullable().optional(),
  reviewedBy: z.uuid().nullable().optional(),
  reviewedAt: z.iso.datetime().nullable().optional(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  employee: leaveEmployeeSchema.optional(),
});

export const leaveResponseJsonSchema = z.toJSONSchema(z.object({ leaveRequest: leaveRequestSchema }));
export const leaveListResponseJsonSchema = z.toJSONSchema(z.object({
  leaveRequests: z.array(leaveRequestSchema), ...paginationResponseShape,
}));

export type CreateLeaveRequest = z.infer<typeof createLeaveRequestSchema>;
export type PatchLeaveRequest = z.infer<typeof patchLeaveRequestSchema>;
export type ReviewLeaveRequest = z.infer<typeof reviewLeaveRequestSchema>;
export type RejectLeaveRequest = z.infer<typeof rejectLeaveRequestSchema>;
export type LeaveListQuery = z.infer<typeof leaveListQuerySchema>;
