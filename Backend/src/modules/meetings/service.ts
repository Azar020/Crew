import { sql, type SQL } from 'drizzle-orm';
import type { AuthContext } from '../auth/service.js';
import { AppError } from '../../shared/errors.js';
import { assertSupportedTimezone } from '../../shared/timezone.js';
import { withRecordAccess } from '../../shared/record-access.js';
import type {
  CreateMeeting,
  MeetingListQuery,
  PatchMeeting,
} from './schemas.js';

type MeetingRow = {
  id: string;
  title: string;
  description: string | null;
  meetingDate: string;
  startTime: string;
  endTime: string;
  timezone: string;
  location: string | null;
  meetingLink: string | null;
  status: 'scheduled' | 'cancelled' | 'completed';
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  organizerId?: string;
  organizerName?: string;
  organizerEmail?: string;
};

const formatMeeting = (row: MeetingRow) => ({
  id: row.id,
  title: row.title,
  description: row.description,
  meetingDate: row.meetingDate,
  startTime: row.startTime,
  endTime: row.endTime,
  timezone: row.timezone,
  location: row.location,
  meetingLink: row.meetingLink,
  status: row.status,
  createdBy: row.createdBy,
  createdAt: new Date(row.createdAt).toISOString(),
  updatedAt: new Date(row.updatedAt).toISOString(),
  ...(row.organizerId ? {
    organizer: {
      id: row.organizerId,
      name: row.organizerName!,
      email: row.organizerEmail!,
    },
  } : {}),
});

export async function createMeeting(auth: AuthContext, input: CreateMeeting) {
  return withRecordAccess(auth, async (tx) => {
    await assertSupportedTimezone(tx, input.timezone, 'Meeting creation');

    const result = await tx.execute<MeetingRow>(sql`
      INSERT INTO meetings (
        title, description, meeting_date, start_time, end_time,
        timezone, location, meeting_link, status, created_by
      )
      VALUES (
        ${input.title},
        ${input.description ?? null},
        ${input.meetingDate},
        ${input.startTime},
        ${input.endTime},
        ${input.timezone},
        ${input.location ?? null},
        ${input.meetingLink ?? null},
        'scheduled',
        ${auth.employeeId}
      )
      RETURNING id, title, description, meeting_date AS "meetingDate",
        start_time AS "startTime", end_time AS "endTime", timezone,
        location, meeting_link AS "meetingLink", status,
        created_by AS "createdBy", created_at AS "createdAt", updated_at AS "updatedAt"
    `);
    const row = result.rows[0]!;
    return formatMeeting(row);
  }, { admin: true });
}

export async function updateMeeting(auth: AuthContext, id: string, patch: PatchMeeting) {
  return withRecordAccess(auth, async (tx) => {
    const current = (await tx.execute<MeetingRow>(sql`
      SELECT id, title, description, meeting_date AS "meetingDate",
        start_time AS "startTime", end_time AS "endTime", timezone,
        location, meeting_link AS "meetingLink", status,
        created_by AS "createdBy", created_at AS "createdAt", updated_at AS "updatedAt"
      FROM meetings
      WHERE id = ${id}
      FOR UPDATE
    `)).rows[0];

    if (!current) throw new AppError('Meeting not found', 404);

    if (patch.timezone !== undefined) {
      await assertSupportedTimezone(tx, patch.timezone, 'Meeting update');
    }

    const merged = {
      startTime: patch.startTime ?? current.startTime,
      endTime: patch.endTime ?? current.endTime,
    };

    if (merged.endTime <= merged.startTime) {
      throw new AppError('endTime must be later than startTime', 400);
    }

    const changes: SQL[] = [];
    if (patch.title !== undefined) changes.push(sql`title = ${patch.title}`);
    if (patch.description !== undefined) changes.push(sql`description = ${patch.description}`);
    if (patch.meetingDate !== undefined) changes.push(sql`meeting_date = ${patch.meetingDate}`);
    if (patch.startTime !== undefined) changes.push(sql`start_time = ${patch.startTime}`);
    if (patch.endTime !== undefined) changes.push(sql`end_time = ${patch.endTime}`);
    if (patch.timezone !== undefined) changes.push(sql`timezone = ${patch.timezone}`);
    if (patch.location !== undefined) changes.push(sql`location = ${patch.location}`);
    if (patch.meetingLink !== undefined) changes.push(sql`meeting_link = ${patch.meetingLink}`);
    if (patch.status !== undefined) changes.push(sql`status = ${patch.status}`);

    if (changes.length === 0) return formatMeeting(current);
    changes.push(sql`updated_at = clock_timestamp()`);

    const result = await tx.execute<MeetingRow>(sql`
      UPDATE meetings
      SET ${sql.join(changes, sql`, `)}
      WHERE id = ${id}
      RETURNING id, title, description, meeting_date AS "meetingDate",
        start_time AS "startTime", end_time AS "endTime", timezone,
        location, meeting_link AS "meetingLink", status,
        created_by AS "createdBy", created_at AS "createdAt", updated_at AS "updatedAt"
    `);
    return formatMeeting(result.rows[0]!);
  }, { admin: true });
}

export async function cancelMeeting(auth: AuthContext, id: string) {
  return updateMeeting(auth, id, { status: 'cancelled' });
}

export async function completeMeeting(auth: AuthContext, id: string) {
  return updateMeeting(auth, id, { status: 'completed' });
}

export async function getMeeting(auth: AuthContext, id: string) {
  return withRecordAccess(auth, async (tx) => {
    const result = await tx.execute<MeetingRow>(sql`
      SELECT m.id, m.title, m.description, m.meeting_date AS "meetingDate",
        m.start_time AS "startTime", m.end_time AS "endTime", m.timezone,
        m.location, m.meeting_link AS "meetingLink", m.status,
        m.created_by AS "createdBy", m.created_at AS "createdAt", m.updated_at AS "updatedAt",
        emp.id AS "organizerId", emp.name AS "organizerName", emp.email AS "organizerEmail"
      FROM meetings m
      JOIN employees emp ON m.created_by = emp.id
      WHERE m.id = ${id}
    `);

    const row = result.rows[0];
    if (!row) throw new AppError('Meeting not found', 404);
    return formatMeeting(row);
  });
}

export async function listMeetings(auth: AuthContext, query: MeetingListQuery) {
  return withRecordAccess(auth, async (tx) => {
    const conditions: SQL[] = [sql`true`];

    if (query.status !== undefined) {
      conditions.push(sql`m.status = ${query.status}`);
    }
    if (query.fromDate !== undefined) {
      conditions.push(sql`m.meeting_date >= ${query.fromDate}::date`);
    }
    if (query.toDate !== undefined) {
      conditions.push(sql`m.meeting_date <= ${query.toDate}::date`);
    }

    const result = await tx.execute<MeetingRow>(sql`
      SELECT m.id, m.title, m.description, m.meeting_date AS "meetingDate",
        m.start_time AS "startTime", m.end_time AS "endTime", m.timezone,
        m.location, m.meeting_link AS "meetingLink", m.status,
        m.created_by AS "createdBy", m.created_at AS "createdAt", m.updated_at AS "updatedAt",
        emp.id AS "organizerId", emp.name AS "organizerName", emp.email AS "organizerEmail"
      FROM meetings m
      JOIN employees emp ON m.created_by = emp.id
      WHERE ${sql.join(conditions, sql` AND `)}
      ORDER BY m.meeting_date ASC, m.start_time ASC, m.id ASC
      LIMIT ${query.limit} OFFSET ${query.offset}
    `);

    return {
      meetings: result.rows.map(formatMeeting),
      limit: query.limit,
      offset: query.offset,
    };
  });
}

export async function deleteMeeting(auth: AuthContext, id: string) {
  return withRecordAccess(auth, async (tx) => {
    const result = await tx.execute(sql`
      DELETE FROM meetings WHERE id = ${id} RETURNING id
    `);
    if (result.rowCount === 0) {
      throw new AppError('Meeting not found', 404);
    }
    return { success: true };
  }, { admin: true });
}
