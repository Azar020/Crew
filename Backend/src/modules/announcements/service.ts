import { sql, type SQL } from 'drizzle-orm';
import type { AuthContext } from '../auth/service.js';
import { AppError } from '../../shared/errors.js';
import { withRecordAccess } from '../../shared/record-access.js';
import type {
  AnnouncementListQuery,
  CreateAnnouncement,
  PatchAnnouncement,
} from './schemas.js';

type AnnouncementRow = {
  id: string;
  title: string;
  content: string;
  status: 'draft' | 'published' | 'archived';
  publishedAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  authorId?: string;
  authorName?: string;
  authorEmail?: string;
};

const formatAnnouncement = (row: AnnouncementRow) => ({
  id: row.id,
  title: row.title,
  content: row.content,
  status: row.status,
  publishedAt: row.publishedAt ? new Date(row.publishedAt).toISOString() : null,
  createdBy: row.createdBy,
  createdAt: new Date(row.createdAt).toISOString(),
  updatedAt: new Date(row.updatedAt).toISOString(),
  ...(row.authorId ? {
    author: {
      id: row.authorId,
      name: row.authorName!,
      email: row.authorEmail!,
    },
  } : {}),
});

export async function createAnnouncement(auth: AuthContext, input: CreateAnnouncement) {
  return withRecordAccess(auth, async (tx) => {
    const isPublished = input.status === 'published';
    const result = await tx.execute<AnnouncementRow>(sql`
      INSERT INTO announcements (title, content, status, published_at, created_by)
      VALUES (
        ${input.title},
        ${input.content},
        ${input.status},
        ${isPublished ? sql`clock_timestamp()` : null},
        ${auth.employeeId}
      )
      RETURNING id, title, content, status, published_at AS "publishedAt",
        created_by AS "createdBy", created_at AS "createdAt", updated_at AS "updatedAt"
    `);
    const row = result.rows[0]!;
    return formatAnnouncement(row);
  }, { admin: true });
}

export async function updateAnnouncement(auth: AuthContext, id: string, patch: PatchAnnouncement) {
  return withRecordAccess(auth, async (tx) => {
    const current = (await tx.execute<AnnouncementRow>(sql`
      SELECT id, title, content, status, published_at AS "publishedAt",
        created_by AS "createdBy", created_at AS "createdAt", updated_at AS "updatedAt"
      FROM announcements
      WHERE id = ${id}
      FOR UPDATE
    `)).rows[0];

    if (!current) throw new AppError('Announcement not found', 404);

    const changes: SQL[] = [];
    if (patch.title !== undefined) changes.push(sql`title = ${patch.title}`);
    if (patch.content !== undefined) changes.push(sql`content = ${patch.content}`);
    if (patch.status !== undefined) {
      changes.push(sql`status = ${patch.status}`);
      if (patch.status === 'published' && !current.publishedAt) {
        changes.push(sql`published_at = clock_timestamp()`);
      }
    }

    if (changes.length === 0) return formatAnnouncement(current);
    changes.push(sql`updated_at = clock_timestamp()`);

    const result = await tx.execute<AnnouncementRow>(sql`
      UPDATE announcements
      SET ${sql.join(changes, sql`, `)}
      WHERE id = ${id}
      RETURNING id, title, content, status, published_at AS "publishedAt",
        created_by AS "createdBy", created_at AS "createdAt", updated_at AS "updatedAt"
    `);
    return formatAnnouncement(result.rows[0]!);
  }, { admin: true });
}

export async function publishAnnouncement(auth: AuthContext, id: string) {
  return updateAnnouncement(auth, id, { status: 'published' });
}

export async function archiveAnnouncement(auth: AuthContext, id: string) {
  return updateAnnouncement(auth, id, { status: 'archived' });
}

export async function getAnnouncement(auth: AuthContext, id: string) {
  return withRecordAccess(auth, async (tx, role) => {
    const condition = role === 'admin'
      ? sql`a.id = ${id}`
      : sql`a.id = ${id} AND a.status = 'published'`;

    const result = await tx.execute<AnnouncementRow>(sql`
      SELECT a.id, a.title, a.content, a.status, a.published_at AS "publishedAt",
        a.created_by AS "createdBy", a.created_at AS "createdAt", a.updated_at AS "updatedAt",
        emp.id AS "authorId", emp.name AS "authorName", emp.email AS "authorEmail"
      FROM announcements a
      JOIN employees emp ON a.created_by = emp.id
      WHERE ${condition}
    `);

    const row = result.rows[0];
    if (!row) throw new AppError('Announcement not found', 404);
    return formatAnnouncement(row);
  });
}

export async function listAnnouncements(auth: AuthContext, query: AnnouncementListQuery) {
  return withRecordAccess(auth, async (tx, role) => {
    const conditions: SQL[] = [sql`true`];

    if (role !== 'admin') {
      // Employees only see published announcements
      conditions.push(sql`a.status = 'published'`);
    } else if (query.status !== undefined) {
      // Admin filter by status
      conditions.push(sql`a.status = ${query.status}`);
    }

    const orderBy = role !== 'admin'
      ? sql`a.published_at DESC NULLS LAST, a.created_at DESC, a.id DESC`
      : sql`a.created_at DESC, a.id DESC`;

    const result = await tx.execute<AnnouncementRow>(sql`
      SELECT a.id, a.title, a.content, a.status, a.published_at AS "publishedAt",
        a.created_by AS "createdBy", a.created_at AS "createdAt", a.updated_at AS "updatedAt",
        emp.id AS "authorId", emp.name AS "authorName", emp.email AS "authorEmail"
      FROM announcements a
      JOIN employees emp ON a.created_by = emp.id
      WHERE ${sql.join(conditions, sql` AND `)}
      ORDER BY ${orderBy}
      LIMIT ${query.limit} OFFSET ${query.offset}
    `);

    return {
      announcements: result.rows.map(formatAnnouncement),
      limit: query.limit,
      offset: query.offset,
    };
  });
}

export async function deleteAnnouncement(auth: AuthContext, id: string) {
  return withRecordAccess(auth, async (tx) => {
    const result = await tx.execute(sql`
      DELETE FROM announcements WHERE id = ${id} RETURNING id
    `);
    if (result.rowCount === 0) {
      throw new AppError('Announcement not found', 404);
    }
    return { success: true };
  }, { admin: true });
}
