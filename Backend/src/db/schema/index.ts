import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * Application roles. "Manager" is only an email notification recipient,
 * never a backend role or auth subject.
 */
export const employeeRoleEnum = pgEnum('employee_role', ['admin', 'employee']);
export const leaveStatusEnum = pgEnum('leave_status', ['pending', 'approved', 'rejected']);
export const announcementStatusEnum = pgEnum('announcement_status', ['draft', 'published', 'archived']);
export const meetingStatusEnum = pgEnum('meeting_status', ['scheduled', 'cancelled', 'completed']);

/**
 * Pre-provisioned employees and admins. An account must exist here and be
 * active BEFORE a Google Workspace login succeeds; Google never auto-creates
 * users or assigns roles. `google_sub` is bound once at first verified login
 * and never replaced silently afterwards.
 *
 * Company emails are stored lowercase (checked by constraint) so that email
 * matching is deterministic; the unique index on `google_sub` makes identity
 * collisions impossible at the database level.
 */
export const employees = pgTable(
  'employees',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    name: text('name').notNull(),
    email: text('email').notNull(),
    googleSub: text('google_sub'),
    role: employeeRoleEnum('role').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    /**
     * Work timezone (IANA identifier) for attendance date derivation.
     * Nullable for employees provisioned before this field existed: attendance
     * stays blocked until an admin sets it explicitly. Never silently defaulted.
     */
    timezone: text('timezone'),
    department: text('department'),
    designation: text('designation'),
    phoneNumber: text('phone_number'),
    address: text('address'),
    employeeId: text('employee_id'),
    passwordHash: text('password_hash'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check('employees_email_lowercase_check', sql`${table.email} = lower(${table.email})`),
    check('employees_email_trimmed_check', sql`${table.email} = btrim(${table.email}, E' \\t\\n\\r\\f\\013')`),
    uniqueIndex('employees_email_unique_idx').on(table.email),
    uniqueIndex('employees_google_sub_unique_idx').on(table.googleSub),
    index('employees_role_idx').on(table.role),
    index('employees_is_active_idx').on(table.isActive),
    index('employees_department_idx').on(table.department),
  ],
);

/**
 * Application-owned, revocable sessions backing HttpOnly cookies. The cookie
 * carries a random opaque token (>= 32 bytes); only its SHA-256 hash is
 * stored. Google tokens are never retained here.
 *
 * - `idleExpiresAt` moves forward on activity, but is capped by
 *   `absoluteExpiresAt` (activity never extends the absolute expiry).
 * - `csrfToken` is the session-bound CSRF token exposed via GET /auth/csrf.
 *   It is only usable together with the HttpOnly session cookie; the session
 *   token itself is never stored in plaintext (see `tokenHash`).
 */
export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tokenHash: text('token_hash').notNull(),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    csrfToken: text('csrf_token').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastActivityAt: timestamp('last_activity_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    idleExpiresAt: timestamp('idle_expires_at', { withTimezone: true })
      .notNull(),
    absoluteExpiresAt: timestamp('absolute_expires_at', { withTimezone: true })
      .notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('sessions_token_hash_unique_idx').on(table.tokenHash),
    index('sessions_employee_id_idx').on(table.employeeId),
    index('sessions_idle_expires_at_idx').on(table.idleExpiresAt),
    index('sessions_absolute_expires_at_idx').on(table.absoluteExpiresAt),
    index('sessions_revoked_at_idx').on(table.revokedAt),
  ],
);

/**
 * Short-lived, browser-bound OAuth 2.0 login transactions. Created by
 * GET /auth/login and consumed exactly once by GET /auth/callback. The
 * initiating browser is bound via a random cookie value; only the cookie's
 * SHA-256 hash is stored (`browserTokenHash`).
 *
 * Rows expire after five minutes and are consumed atomically
 * (single UPDATE ... WHERE consumed_at IS NULL).
 */
export const oauthTransactions = pgTable(
  'oauth_transactions',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    state: text('state').notNull(),
    nonce: text('nonce').notNull(),
    codeVerifier: text('code_verifier').notNull(),
    browserTokenHash: text('browser_token_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('oauth_transactions_state_unique_idx').on(table.state),
    uniqueIndex('oauth_transactions_browser_token_hash_unique_idx').on(
      table.browserTokenHash,
    ),
    index('oauth_transactions_expires_at_idx').on(table.expiresAt),
  ],
);

/** Persistent, transactional employee audit trail. Personal values are excluded;
 * before/after contain only administrative access state (role/isActive).
 * Restrict deletion to preserve attribution and history.
 */
export const employeeAuditEvents = pgTable('employee_audit_events', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  actorId: uuid('actor_id').notNull().references(() => employees.id),
  targetId: uuid('target_id').notNull().references(() => employees.id),
  action: text('action').notNull(),
  changedFields: text('changed_fields').array().notNull(),
  before: jsonb('before').$type<{
    role?: 'admin' | 'employee';
    isActive?: boolean;
    timezone?: string | null;
    department?: string | null;
    designation?: string | null;
    phoneNumber?: string | null;
    address?: string | null;
  }>(),
  after: jsonb('after').$type<{
    role?: 'admin' | 'employee';
    isActive?: boolean;
    timezone?: string | null;
    department?: string | null;
    designation?: string | null;
    phoneNumber?: string | null;
    address?: string | null;
  }>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('employee_audit_events_target_created_idx').on(table.targetId, table.createdAt)]);

/**
 * Leave requests supporting full approval workflow (pending, approved, rejected).
 * All submissions acquire exclusive employee row lock before checking overlaps.
 */
export const leaveRequests = pgTable('leave_requests', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  employeeId: uuid('employee_id').notNull().references(() => employees.id, { onDelete: 'restrict' }),
  startDate: date('start_date').notNull(),
  endDate: date('end_date').notNull(),
  reason: text('reason'),
  status: leaveStatusEnum('status').notNull().default('pending'),
  leaveType: text('leave_type').notNull().default('casual'),
  rejectionReason: text('rejection_reason'),
  reviewedBy: uuid('reviewed_by').references(() => employees.id, { onDelete: 'restrict' }),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check('leave_requests_dates_check', sql`${table.endDate} >= ${table.startDate}`),
  uniqueIndex('leave_requests_employee_dates_unique_idx').on(table.employeeId, table.startDate, table.endDate),
  index('leave_requests_owner_created_idx').on(table.employeeId, table.createdAt.desc(), table.id.desc()),
  index('leave_requests_created_idx').on(table.createdAt.desc(), table.id.desc()),
  index('leave_requests_end_date_idx').on(table.endDate),
  index('leave_requests_status_idx').on(table.status),
  index('leave_requests_employee_status_idx').on(table.employeeId, table.status),
]);

export const leaveAuditEvents = pgTable('leave_audit_events', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  actorId: uuid('actor_id').notNull().references(() => employees.id),
  leaveRequestId: uuid('leave_request_id').notNull(),
  action: text('action').notNull(),
  changedFields: text('changed_fields').array().notNull(),
  before: jsonb('before').$type<{ status?: string; reason?: string | null }>(),
  after: jsonb('after').$type<{ status?: string; rejectionReason?: string | null }>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('leave_audit_events_leave_created_idx').on(table.leaveRequestId, table.createdAt)]);

export const dailyUpdates = pgTable('daily_updates', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  employeeId: uuid('employee_id').notNull().references(() => employees.id, { onDelete: 'restrict' }),
  workDate: date('work_date').notNull(),
  content: text('content').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('daily_updates_employee_work_date_unique_idx').on(table.employeeId, table.workDate),
  index('daily_updates_owner_created_idx').on(table.employeeId, table.createdAt.desc(), table.id.desc()),
  index('daily_updates_created_idx').on(table.createdAt.desc(), table.id.desc()),
  index('daily_updates_work_date_idx').on(table.workDate),
]);

export const holidays = pgTable('holidays', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name: text('name').notNull(),
  date: date('date').notNull(),
  createdBy: uuid('created_by').notNull().references(() => employees.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex('holidays_date_unique_idx').on(table.date)]);

export const holidayAuditEvents = pgTable('holiday_audit_events', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  actorId: uuid('actor_id').notNull().references(() => employees.id, { onDelete: 'restrict' }),
  // Intentionally not an FK: immutable attribution must survive holiday deletion.
  holidayId: uuid('holiday_id').notNull(),
  action: text('action').notNull(),
  changedFields: text('changed_fields').array().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('holiday_audit_events_holiday_created_idx').on(table.holidayId, table.createdAt)]);

/**
 * Explicit check-in/out sessions, fully independent of application login.
 * `work_date` is the employee-local check-in date, derived from ONE database
 * instant captured after the necessary locks (never the client clock, never
 * the server's physical timezone). `timezone_at_check_in` snapshots the
 * employee's zone so later timezone changes never rewrite history. A
 * forgotten checkout stays open (no timeout, no auto-close) and blocks the
 * next check-in until an explicit checkout. Session duration is always
 * derived from the two timestamps, never stored.
 */
export const attendance = pgTable('attendance', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  employeeId: uuid('employee_id').notNull().references(() => employees.id, { onDelete: 'restrict' }),
  workDate: date('work_date').notNull(),
  timezoneAtCheckIn: text('timezone_at_check_in').notNull(),
  checkedInAt: timestamp('checked_in_at', { withTimezone: true }).notNull(),
  checkedOutAt: timestamp('checked_out_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check('attendance_checkout_order_check',
    sql`${table.checkedOutAt} IS NULL OR ${table.checkedOutAt} >= ${table.checkedInAt}`),
  uniqueIndex('attendance_employee_work_date_unique_idx').on(table.employeeId, table.workDate),
  uniqueIndex('attendance_open_session_unique_idx').on(table.employeeId)
    .where(sql`${table.checkedOutAt} IS NULL`),
  index('attendance_owner_checked_in_idx').on(table.employeeId, table.checkedInAt.desc(), table.id.desc()),
  index('attendance_work_date_idx').on(table.workDate),
]);

/** Persistent, transactional attendance audit trail (field names only). Same
 * pattern as holiday audits: attribution is not an FK and must survive any
 * future record-retention policy.
 */
export const attendanceAuditEvents = pgTable('attendance_audit_events', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  actorId: uuid('actor_id').notNull().references(() => employees.id),
  attendanceId: uuid('attendance_id').notNull(),
  action: text('action').notNull(),
  changedFields: text('changed_fields').array().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('attendance_audit_events_attendance_created_idx').on(table.attendanceId, table.createdAt)]);

export const attendanceBreaks = pgTable('attendance_breaks', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  attendanceId: uuid('attendance_id').notNull().references(() => attendance.id, { onDelete: 'cascade' }),
  employeeId: uuid('employee_id').notNull().references(() => employees.id, { onDelete: 'restrict' }),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check('attendance_breaks_order_check',
    sql`${table.endedAt} IS NULL OR ${table.endedAt} >= ${table.startedAt}`),
  uniqueIndex('attendance_breaks_active_unique_idx').on(table.employeeId)
    .where(sql`${table.endedAt} IS NULL`),
  index('attendance_breaks_attendance_started_idx').on(table.attendanceId, table.startedAt),
  index('attendance_breaks_employee_started_idx').on(table.employeeId, table.startedAt.desc(), table.id.desc()),
]);

export const announcements = pgTable('announcements', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  title: text('title').notNull(),
  content: text('content').notNull(),
  status: announcementStatusEnum('status').notNull().default('draft'),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  createdBy: uuid('created_by').notNull().references(() => employees.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('announcements_status_idx').on(table.status),
  index('announcements_published_at_idx').on(table.publishedAt.desc()),
  index('announcements_created_idx').on(table.createdAt.desc(), table.id.desc()),
  index('announcements_created_by_idx').on(table.createdBy),
]);

export const meetings = pgTable('meetings', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  title: text('title').notNull(),
  description: text('description'),
  meetingDate: date('meeting_date').notNull(),
  startTime: text('start_time').notNull(),
  endTime: text('end_time').notNull(),
  timezone: text('timezone').notNull(),
  location: text('location'),
  meetingLink: text('meeting_link'),
  status: meetingStatusEnum('status').notNull().default('scheduled'),
  createdBy: uuid('created_by').notNull().references(() => employees.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check('meetings_time_order_check', sql`${table.endTime} > ${table.startTime}`),
  index('meetings_date_time_idx').on(table.meetingDate, table.startTime),
  index('meetings_status_idx').on(table.status),
  index('meetings_created_by_idx').on(table.createdBy),
  index('meetings_created_idx').on(table.createdAt.desc(), table.id.desc()),
]);

export type Employee = typeof employees.$inferSelect;
export type NewEmployee = typeof employees.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type OauthTransaction = typeof oauthTransactions.$inferSelect;
export type LeaveRequest = typeof leaveRequests.$inferSelect;
export type NewLeaveRequest = typeof leaveRequests.$inferInsert;
export type AttendanceBreak = typeof attendanceBreaks.$inferSelect;
export type NewAttendanceBreak = typeof attendanceBreaks.$inferInsert;
export type Announcement = typeof announcements.$inferSelect;
export type NewAnnouncement = typeof announcements.$inferInsert;
export type Meeting = typeof meetings.$inferSelect;
export type NewMeeting = typeof meetings.$inferInsert;
