import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

/**
 * Drizzle Kit configuration.
 *
 * NOTE: The schema directory is intentionally empty for now. Planned tables
 * (employees, sessions, attendance, leave_requests, daily_updates, holidays,
 * integration_jobs) are documented in src/db/schema/tables.md but business
 * schemas are not finalized yet. Run `npm run db:generate` only after the
 * schema in src/db/schema/index.ts has been finalized.
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgresql://localhost:5432/teamdesk',
  },
  verbose: true,
  strict: false,
});
