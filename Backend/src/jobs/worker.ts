import { UnimplementedError } from '../shared/errors.js';

/**
 * STUB — integration job worker. NOT IMPLEMENTED and NOT STARTED by server.ts.
 *
 * Planned: a persistent worker that claims pending rows from the
 * integration_jobs table (see src/db/schema/tables.md), executes them via the
 * email and Google Sheets adapters, and retries with backoff up to
 * max_attempts before marking a job failed. Jobs must survive restarts.
 *
 * Deliberately unimplemented: this scaffold does not send emails, sync to
 * Sheets, or write to the database.
 */

/** If ever called, fails loudly instead of pretending to deliver. */
export function startIntegrationJobWorker(): never {
  throw new UnimplementedError('jobs.startIntegrationJobWorker');
}
