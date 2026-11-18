import { describe, expect, it } from 'vitest';
import { calendarDateSchema, companyDate } from '../src/shared/calendar.js';
import { safeRecordError } from '../src/shared/record-access.js';

describe('calendar policy', () => {
  it.each(['2024-02-29', '2000-02-29', '0001-01-01', '9999-12-31', '2026-04-30'])('accepts %s', (value) => {
    expect(calendarDateSchema.safeParse(value).success).toBe(true);
  });
  it.each(['2025-02-29', '1900-02-29', '2026-02-30', '2026-04-31', '2026-13-01', '2026-00-01',
    '2026-01-00', '0000-01-01', '10000-01-01', '2026-1-01', '2026-01-01T00:00:00Z', 'infinity', ' 2026-01-01'])
    ('rejects %s', (value) => { expect(calendarDateSchema.safeParse(value).success).toBe(false); });

  it('uses the configured calendar at midnight/year and DST boundaries', () => {
    const now = new Date('2026-12-31T20:00:00Z');
    expect(companyDate(now, 'UTC')).toBe('2026-12-31');
    expect(companyDate(now, 'Asia/Kolkata')).toBe('2027-01-01');
    expect(companyDate(new Date('2026-01-01T00:30:00Z'), 'America/Los_Angeles')).toBe('2025-12-31');
    expect(companyDate(new Date('2026-03-08T09:59:00Z'), 'America/Los_Angeles')).toBe('2026-03-08');
    expect(companyDate(new Date('2026-03-08T10:01:00Z'), 'America/Los_Angeles')).toBe('2026-03-08');
  });
});

describe('specific constraint mapping', () => {
  it('does not translate unrelated uniqueness failures into business conflicts or expose SQL data', () => {
    const constraints = [{ code: '23505', constraint: 'daily_updates_employee_work_date_unique_idx', message: 'Duplicate day' }];
    const error = { message: 'INSERT secret work content', params: ['private'], cause: {
      code: '23505', constraint: 'unrelated_unique_idx', detail: 'private',
    } };
    const result = safeRecordError(error, constraints);
    expect(result).toMatchObject({ name: 'RecordDatabaseError', databaseCode: '23505' });
    expect(result).not.toHaveProperty('statusCode');
    expect(result.cause).toBeUndefined();
    expect(JSON.stringify(result) + result.message).not.toMatch(/private|secret|INSERT|unrelated/);
    expect(safeRecordError({ cause: { code: '23505', constraint: constraints[0]!.constraint } }, constraints))
      .toMatchObject({ statusCode: 409, message: 'Duplicate day' });
  });
});
