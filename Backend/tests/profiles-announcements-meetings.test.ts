import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { createSession, type CreatedSession } from '../src/modules/auth/service.js';
import { databaseAvailable, resetTables, seedEmployee, testPool, closeTestPool } from './helpers/db.js';

const available = await databaseAvailable();

describe.skipIf(!available)('Employee Profiles, Announcements & Meetings (real PostgreSQL)', () => {
  let app: FastifyInstance;
  let admin: CreatedSession;
  let employee: CreatedSession;
  // other session not used directly in tests
  let employeeId: string;
  let otherId: string;

  beforeEach(async () => {
    await resetTables();
    app = await buildApp();
    admin = await createSession(await seedEmployee({ email: 'admin@transacty.ai', role: 'admin' }));
    employeeId = await seedEmployee({
      email: 'alice@transacty.ai',
      role: 'employee',
      name: 'Alice',
      department: 'Engineering',
      designation: 'Staff Engineer',
      phoneNumber: '+1234567890',
      address: '100 Innovation Way',
    });
    employee = await createSession(employeeId);
    otherId = await seedEmployee({
      email: 'bob@transacty.ai',
      role: 'employee',
      name: 'Bob',
      department: 'Marketing',
      designation: 'Marketing Lead',
    });
    // other session unused; otherId is used directly
  });

  afterEach(async () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    await app.close();
  });

  afterAll(closeTestPool);

  function request(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    url: string,
    session?: CreatedSession,
    body?: object | string,
    headers?: Record<string, string>,
  ) {
    return app.inject({
      method,
      url,
      ...(session ? { cookies: { teamdesk_session: session.cookieToken } } : {}),
      ...(body !== undefined ? { payload: body } : {}),
      headers: headers ?? (session ? { 'x-csrf-token': session.context.csrfToken } : {}),
    });
  }

  // ==========================================
  // PART A: EMPLOYEE PROFILES
  // ==========================================
  describe('Employee Profiles', () => {
    it('Employee views own profile with department, designation, and contact info', async () => {
      const res = await request('GET', '/employees/me', employee);
      expect(res.statusCode).toBe(200);
      const prof = res.json().employee;
      expect(prof.id).toBe(employeeId);
      expect(prof.name).toBe('Alice');
      expect(prof.department).toBe('Engineering');
      expect(prof.designation).toBe('Staff Engineer');
      expect(prof.phoneNumber).toBe('+1234567890');
      expect(prof.address).toBe('100 Innovation Way');
    });

    it('Employee updates permitted profile fields (name, phone, address)', async () => {
      const patchRes = await request('PATCH', '/employees/me', employee, {
        name: 'Alice Cooper',
        phoneNumber: '+9876543210',
        address: '200 Silicon Blvd',
      });
      expect(patchRes.statusCode).toBe(200);
      const updated = patchRes.json().employee;
      expect(updated.name).toBe('Alice Cooper');
      expect(updated.phoneNumber).toBe('+9876543210');
      expect(updated.address).toBe('200 Silicon Blvd');
      expect(updated.department).toBe('Engineering'); // unchanged

      // Read back to verify persistence
      const readRes = await request('GET', '/employees/me', employee);
      expect(readRes.json().employee.name).toBe('Alice Cooper');
      expect(readRes.json().employee.phoneNumber).toBe('+9876543210');
      expect(readRes.json().employee.address).toBe('200 Silicon Blvd');

      // Verify audit trail logged in employee_audit_events
      const audit = await testPool().query(
        "SELECT * FROM employee_audit_events WHERE target_id = $1 AND action = 'employee.profile_updated'",
        [employeeId],
      );
      expect(audit.rows.length).toBeGreaterThan(0);
      expect(audit.rows[0].changed_fields).toEqual(expect.arrayContaining(['name', 'phoneNumber', 'address']));
    });

    it('Employee cannot change role, status, department, designation, or timezone', async () => {
      for (const [key, val] of [
        ['role', 'admin'],
        ['isActive', false],
        ['department', 'Executive'],
        ['designation', 'CTO'],
        ['timezone', 'America/New_York'],
      ]) {
        const res = await request('PATCH', '/employees/me', employee, { [key as string]: val });
        expect(res.statusCode).toBe(400);
      }
    });

    it('Admin views, searches, filters, and updates employee profiles', async () => {
      // Admin views employee profile
      const detailRes = await request('GET', `/employees/${employeeId}`, admin);
      expect(detailRes.statusCode).toBe(200);
      expect(detailRes.json().employee.department).toBe('Engineering');

      // Admin updates employee department, designation, phone, address
      const updateRes = await request('PATCH', `/employees/${employeeId}`, admin, {
        department: 'Research and Development',
        designation: 'Principal Architect',
        phoneNumber: '+1112223333',
        address: '500 RD Campus',
      });
      expect(updateRes.statusCode).toBe(200);
      const updated = updateRes.json().employee;
      expect(updated.department).toBe('Research and Development');
      expect(updated.designation).toBe('Principal Architect');
      expect(updated.phoneNumber).toBe('+1112223333');
      expect(updated.address).toBe('500 RD Campus');

      // Admin filters by department
      const rdList = await request('GET', '/employees?department=Research%20and%20Development', admin);
      expect(rdList.statusCode).toBe(200);
      expect(rdList.json().employees).toHaveLength(1);
      expect(rdList.json().employees[0].id).toBe(employeeId);

      const mktList = await request('GET', '/employees?department=Marketing', admin);
      expect(mktList.statusCode).toBe(200);
      expect(mktList.json().employees).toHaveLength(1);
      expect(mktList.json().employees[0].id).toBe(otherId);

      // Admin searches by keyword across name, email, department, designation
      const searchRes = await request('GET', '/employees?search=Architect', admin);
      expect(searchRes.statusCode).toBe(200);
      expect(searchRes.json().employees).toHaveLength(1);
      expect(searchRes.json().employees[0].id).toBe(employeeId);
    });
  });

  // ==========================================
  // PART B: ANNOUNCEMENT MANAGEMENT
  // ==========================================
  describe('Announcements', () => {
    it('Admin creates draft announcement', async () => {
      const res = await request('POST', '/announcements', admin, {
        title: 'Office Upgrade',
        content: 'New monitors will be distributed on Monday.',
      });
      expect(res.statusCode).toBe(201);
      const ann = res.json().announcement;
      expect(ann.title).toBe('Office Upgrade');
      expect(ann.content).toBe('New monitors will be distributed on Monday.');
      expect(ann.status).toBe('draft');
      expect(ann.publishedAt).toBeNull();
      expect(ann.createdBy).toBe(admin.context.employeeId);
    });

    it('Admin publishes and archives announcements', async () => {
      const created = (await request('POST', '/announcements', admin, {
        title: 'Fire Drill Announcement',
        content: 'Fire drill scheduled for tomorrow at 2 PM.',
      })).json().announcement;

      // Publish announcement
      const pubRes = await request('PATCH', `/announcements/${created.id}/publish`, admin);
      expect(pubRes.statusCode).toBe(200);
      expect(pubRes.json().announcement.status).toBe('published');
      expect(pubRes.json().announcement.publishedAt).not.toBeNull();

      // Edit published announcement
      const editRes = await request('PATCH', `/announcements/${created.id}`, admin, {
        title: 'Updated Fire Drill Announcement',
      });
      expect(editRes.statusCode).toBe(200);
      expect(editRes.json().announcement.title).toBe('Updated Fire Drill Announcement');

      // Archive announcement
      const archRes = await request('PATCH', `/announcements/${created.id}/archive`, admin);
      expect(archRes.statusCode).toBe(200);
      expect(archRes.json().announcement.status).toBe('archived');
    });

    it('Admin creates directly published announcement', async () => {
      const res = await request('POST', '/announcements', admin, {
        title: 'Company Picnic',
        content: 'Join us for barbecue this Friday.',
        status: 'published',
      });
      expect(res.statusCode).toBe(201);
      const ann = res.json().announcement;
      expect(ann.status).toBe('published');
      expect(ann.publishedAt).toBeDefined();
    });

    it('Employee sees published announcements and cannot see draft or archived announcements', async () => {
      // 1. Create a draft announcement
      const draft = (await request('POST', '/announcements', admin, {
        title: 'Secret Draft',
        content: 'Not ready yet.',
      })).json().announcement;

      // 2. Create a published announcement
      const published = (await request('POST', '/announcements', admin, {
        title: 'Public Notice',
        content: 'All employees please read.',
        status: 'published',
      })).json().announcement;

      // 3. Create an archived announcement
      const archived = (await request('POST', '/announcements', admin, {
        title: 'Old Notice',
        content: 'This has passed.',
      })).json().announcement;
      await request('PATCH', `/announcements/${archived.id}/archive`, admin);

      // Employee lists announcements -> only published is visible
      const empList = await request('GET', '/announcements', employee);
      expect(empList.statusCode).toBe(200);
      const list = empList.json().announcements;
      expect(list.some((a: { id: string }) => a.id === published.id)).toBe(true);
      expect(list.some((a: { id: string }) => a.id === draft.id)).toBe(false);
      expect(list.some((a: { id: string }) => a.id === archived.id)).toBe(false);

      // Direct lookup: employee gets 200 on published
      const pubDetail = await request('GET', `/announcements/${published.id}`, employee);
      expect(pubDetail.statusCode).toBe(200);
      expect(pubDetail.json().announcement.title).toBe('Public Notice');
      expect(pubDetail.json().announcement.author.email).toBe('admin@transacty.ai');

      // Direct lookup: employee gets 404 on draft and archived
      expect((await request('GET', `/announcements/${draft.id}`, employee)).statusCode).toBe(404);
      expect((await request('GET', `/announcements/${archived.id}`, employee)).statusCode).toBe(404);

      // Admin CAN view draft and archived
      expect((await request('GET', `/announcements/${draft.id}`, admin)).statusCode).toBe(200);
      expect((await request('GET', `/announcements/${archived.id}`, admin)).statusCode).toBe(200);
    });

    it('Employee cannot create, edit, or archive announcements', async () => {
      const created = (await request('POST', '/announcements', admin, {
        title: 'Notice',
        content: 'Info',
        status: 'published',
      })).json().announcement;

      expect((await request('POST', '/announcements', employee, { title: 'Hack', content: 'Hack' })).statusCode).toBe(403);
      expect((await request('PATCH', `/announcements/${created.id}`, employee, { title: 'Hijack' })).statusCode).toBe(403);
      expect((await request('PATCH', `/announcements/${created.id}/publish`, employee)).statusCode).toBe(403);
      expect((await request('PATCH', `/announcements/${created.id}/archive`, employee)).statusCode).toBe(403);
    });

    it('Unauthenticated access to announcements is denied', async () => {
      expect((await request('GET', '/announcements')).statusCode).toBe(401);
      expect((await request('POST', '/announcements', undefined, { title: 'Test', content: 'Test' })).statusCode).toBe(401);
    });
  });

  // ==========================================
  // PART C: MEETING MANAGEMENT
  // ==========================================
  describe('Meeting Management', () => {
    it('Admin schedules a meeting with date, time, timezone, location, and meeting link', async () => {
      const res = await request('POST', '/meetings', admin, {
        title: 'Sprint Planning',
        description: 'Reviewing next two weeks backlog',
        meetingDate: '2025-08-20',
        startTime: '10:00',
        endTime: '11:00',
        timezone: 'Asia/Kolkata',
        location: 'Conference Room 3A',
        meetingLink: 'https://meet.google.com/abc-defg-hij',
      });
      expect(res.statusCode).toBe(201);
      const m = res.json().meeting;
      expect(m.title).toBe('Sprint Planning');
      expect(m.description).toBe('Reviewing next two weeks backlog');
      expect(m.meetingDate).toBe('2025-08-20');
      expect(m.startTime).toBe('10:00');
      expect(m.endTime).toBe('11:00');
      expect(m.timezone).toBe('Asia/Kolkata');
      expect(m.location).toBe('Conference Room 3A');
      expect(m.meetingLink).toBe('https://meet.google.com/abc-defg-hij');
      expect(m.status).toBe('scheduled');
      expect(m.createdBy).toBe(admin.context.employeeId);
    });

    it('Admin edits, cancels, and completes meetings', async () => {
      const created = (await request('POST', '/meetings', admin, {
        title: 'Project Kickoff',
        meetingDate: '2025-09-01',
        startTime: '14:00',
        endTime: '15:00',
        timezone: 'UTC',
      })).json().meeting;

      // Edit meeting
      const editRes = await request('PATCH', `/meetings/${created.id}`, admin, {
        title: 'Project Kickoff (Updated Time)',
        startTime: '14:30',
        endTime: '15:30',
        location: 'Main Auditorium',
      });
      expect(editRes.statusCode).toBe(200);
      expect(editRes.json().meeting.title).toBe('Project Kickoff (Updated Time)');
      expect(editRes.json().meeting.startTime).toBe('14:30');
      expect(editRes.json().meeting.endTime).toBe('15:30');
      expect(editRes.json().meeting.location).toBe('Main Auditorium');

      // Cancel meeting
      const cancelRes = await request('PATCH', `/meetings/${created.id}/cancel`, admin);
      expect(cancelRes.statusCode).toBe(200);
      expect(cancelRes.json().meeting.status).toBe('cancelled');

      // Complete meeting
      const completeRes = await request('PATCH', `/meetings/${created.id}/complete`, admin);
      expect(completeRes.statusCode).toBe(200);
      expect(completeRes.json().meeting.status).toBe('completed');
    });

    it('Employee views upcoming meetings and single meeting details', async () => {
      const m1 = (await request('POST', '/meetings', admin, {
        title: 'Daily Standup',
        meetingDate: '2025-08-21',
        startTime: '09:30',
        endTime: '10:00',
        timezone: 'UTC',
        location: 'Huddle Room',
      })).json().meeting;

      const m2 = (await request('POST', '/meetings', admin, {
        title: 'Architecture Review',
        meetingDate: '2025-08-22',
        startTime: '15:00',
        endTime: '16:00',
        timezone: 'UTC',
        meetingLink: 'https://meet.google.com/xyz',
      })).json().meeting;

      // Employee lists meetings
      const listRes = await request('GET', '/meetings', employee);
      expect(listRes.statusCode).toBe(200);
      const list = listRes.json().meetings;
      expect(list.length).toBeGreaterThanOrEqual(2);
      expect(list.some((m: { id: string }) => m.id === m1.id)).toBe(true);
      expect(list.some((m: { id: string }) => m.id === m2.id)).toBe(true);

      // Employee views individual meeting details with organizer info
      const detailRes = await request('GET', `/meetings/${m1.id}`, employee);
      expect(detailRes.statusCode).toBe(200);
      const detail = detailRes.json().meeting;
      expect(detail.title).toBe('Daily Standup');
      expect(detail.location).toBe('Huddle Room');
      expect(detail.organizer.email).toBe('admin@transacty.ai');

      // Filter by date range
      const dateFilter = await request('GET', '/meetings?fromDate=2025-08-22&toDate=2025-08-25', employee);
      expect(dateFilter.statusCode).toBe(200);
      expect(dateFilter.json().meetings.some((m: { id: string }) => m.id === m1.id)).toBe(false);
      expect(dateFilter.json().meetings.some((m: { id: string }) => m.id === m2.id)).toBe(true);
    });

    it('Employee cannot create, edit, or cancel meetings', async () => {
      const created = (await request('POST', '/meetings', admin, {
        title: 'Team Sync',
        meetingDate: '2025-08-25',
        startTime: '11:00',
        endTime: '12:00',
        timezone: 'UTC',
      })).json().meeting;

      expect((await request('POST', '/meetings', employee, {
        title: 'Hack Meeting',
        meetingDate: '2025-08-25',
        startTime: '11:00',
        endTime: '12:00',
        timezone: 'UTC',
      })).statusCode).toBe(403);

      expect((await request('PATCH', `/meetings/${created.id}`, employee, { title: 'Hijack' })).statusCode).toBe(403);
      expect((await request('PATCH', `/meetings/${created.id}/cancel`, employee)).statusCode).toBe(403);
      expect((await request('PATCH', `/meetings/${created.id}/complete`, employee)).statusCode).toBe(403);
    });

    it('Invalid dates, times, and ranges are rejected with 400', async () => {
      // End time before start time
      const inverted = await request('POST', '/meetings', admin, {
        title: 'Inverted Time',
        meetingDate: '2025-08-20',
        startTime: '14:00',
        endTime: '13:00',
        timezone: 'UTC',
      });
      expect(inverted.statusCode).toBe(400);

      // Start time equals end time
      const equalTimes = await request('POST', '/meetings', admin, {
        title: 'Equal Time',
        meetingDate: '2025-08-20',
        startTime: '14:00',
        endTime: '14:00',
        timezone: 'UTC',
      });
      expect(equalTimes.statusCode).toBe(400);

      // Invalid time format
      const invalidTime = await request('POST', '/meetings', admin, {
        title: 'Bad Time',
        meetingDate: '2025-08-20',
        startTime: '25:00',
        endTime: '26:00',
        timezone: 'UTC',
      });
      expect(invalidTime.statusCode).toBe(400);

      // Invalid calendar date
      const leapError = await request('POST', '/meetings', admin, {
        title: 'Bad Date',
        meetingDate: '2025-02-29',
        startTime: '10:00',
        endTime: '11:00',
        timezone: 'UTC',
      });
      expect(leapError.statusCode).toBe(400);

      // Invalid IANA timezone
      const badTz = await request('POST', '/meetings', admin, {
        title: 'Bad Timezone',
        meetingDate: '2025-08-20',
        startTime: '10:00',
        endTime: '11:00',
        timezone: 'Mars/Phobos',
      });
      expect(badTz.statusCode).toBe(400);
    });

    it('Unauthenticated access to meetings is denied', async () => {
      expect((await request('GET', '/meetings')).statusCode).toBe(401);
      expect((await request('POST', '/meetings', undefined, {
        title: 'Test',
        meetingDate: '2025-08-20',
        startTime: '10:00',
        endTime: '11:00',
        timezone: 'UTC',
      })).statusCode).toBe(401);
    });
  });
});
