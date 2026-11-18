/**
 * CLI entry point for the controlled first-admin bootstrap. Never exposed
 * over HTTP.
 *
 * Usage:
 *   npm run bootstrap:admin -- alice@transacty.ai
 *   npm run bootstrap:admin -- alice@transacty.ai --name "Alice Adams"
 */
import 'dotenv/config';
import pg from 'pg';
import {
  BootstrapError,
  bootstrapFirstAdmin,
} from '../src/bootstrap/bootstrap-admin.js';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const email = args[0];
  const nameIndex = args.indexOf('--name');
  const name = nameIndex >= 0 ? args[nameIndex + 1] : undefined;
  const timezoneIndex = args.indexOf('--timezone');
  const timezone = timezoneIndex >= 0 ? args[timezoneIndex + 1] : undefined;
  const passwordIndex = args.indexOf('--password');
  const password = passwordIndex >= 0 ? args[passwordIndex + 1] : undefined;

  if (!email) {
    console.error('Usage: npm run bootstrap:admin -- <company-email> [--name "Full Name"] [--timezone "Asia/Kolkata"] [--password "Secret@123"]');
    process.exitCode = 1;
    return;
  }

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const admin = await bootstrapFirstAdmin(pool, email, name, timezone, password);
    console.log(`Bootstrap complete: admin created.`);
    console.log(`  id:    ${admin.id}`);
    console.log(`  email: ${admin.email}`);
    console.log(`  name:  ${admin.name}`);
    console.log('No Google identity is bound yet; it binds on first verified login.');
  } catch (error) {
    if (error instanceof BootstrapError) {
      console.error(error.message);
      process.exitCode = 1;
      return;
    }
    console.error('Bootstrap failed with an unexpected error (details logged, not shown):');
    console.error(error instanceof Error ? error.name : 'unknown error');
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void main();
