import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  BootstrapError,
  bootstrapFirstAdmin,
  deriveNameFromEmail,
} from '../src/bootstrap/bootstrap-admin.js';
import {
  databaseAvailable,
  resetTables,
  testPool,
  closeTestPool,
} from './helpers/db.js';

/**
 * First-admin bootstrap tests against the real database, including the
 * concurrency-safety of the check-and-insert.
 */
const dbAvailable = await databaseAvailable();

describe.skipIf(!dbAvailable)('first-admin bootstrap (real database)', () => {
  beforeEach(async () => {
    await resetTables();
  });

  afterAll(async () => {
    await closeTestPool();
  });

  it('creates an active admin without a bound Google identity', async () => {
    const admin = await bootstrapFirstAdmin(testPool(), 'Admin.One@transacty.ai');
    expect(admin.email).toBe('admin.one@transacty.ai');
    expect(admin.name).toBe('Admin One');

    const row = (
      await testPool().query(
        "SELECT role, is_active, google_sub FROM employees WHERE email = 'admin.one@transacty.ai'",
      )
    ).rows[0]!;
    expect(row.role).toBe('admin');
    expect(row.is_active).toBe(true);
    expect(row.google_sub).toBeNull();
  });

  it('accepts an explicit name and the n23digitals.com domain', async () => {
    const admin = await bootstrapFirstAdmin(
      testPool(),
      'ops@n23digitals.com',
      'Ops Team',
    );
    expect(admin.name).toBe('Ops Team');
    expect(admin.email).toBe('ops@n23digitals.com');
  });

  it('refuses an existing employee record (any role)', async () => {
    await testPool().query(
      "INSERT INTO employees (name, email, role, is_active) VALUES ('Existing', 'dup@transacty.ai', 'employee', true)",
    );
    await expect(
      bootstrapFirstAdmin(testPool(), 'dup@transacty.ai'),
    ).rejects.toMatchObject({
      name: 'BootstrapError',
      reason: 'employee-exists',
    });
  });

  it('refuses when an admin already exists', async () => {
    await testPool().query(
      "INSERT INTO employees (name, email, role, is_active) VALUES ('First', 'first@transacty.ai', 'admin', true)",
    );
    await expect(
      bootstrapFirstAdmin(testPool(), 'second@transacty.ai'),
    ).rejects.toMatchObject({
      name: 'BootstrapError',
      reason: 'admin-exists',
    });
  });

  it('refuses invalid emails and disallowed domains', async () => {
    await expect(bootstrapFirstAdmin(testPool(), 'not-an-email')).rejects.toThrow(
      BootstrapError,
    );
    await expect(
      bootstrapFirstAdmin(testPool(), 'someone@gmail.com'),
    ).rejects.toMatchObject({ reason: 'disallowed-domain' });
  });

  it('derives the name from the email local part', () => {
    expect(deriveNameFromEmail('jamie.r.fox@transacty.ai')).toBe('Jamie R Fox');
  });

  it('is concurrency-safe: exactly one of two parallel bootstraps succeeds', async () => {
    const results = await Promise.allSettled([
      bootstrapFirstAdmin(testPool(), 'concurrent@transacty.ai'),
      bootstrapFirstAdmin(testPool(), 'concurrent@transacty.ai'),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const reason = (rejected[0] as PromiseRejectedResult).reason;
    expect([reason.reason, 'admin-exists', 'employee-exists']).toContain(reason.reason);

    const count = (
      await testPool().query(
        "SELECT count(*)::int AS n FROM employees WHERE email = 'concurrent@transacty.ai'",
      )
    ).rows[0];
    expect(count.n).toBe(1);
  });
});
