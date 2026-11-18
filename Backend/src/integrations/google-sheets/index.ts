import { UnimplementedError } from '../../shared/errors.js';

/**
 * STUB — Google Sheets adapter. NOT IMPLEMENTED, no credentials required yet.
 *
 * Planned: a service-account-based adapter that mirrors leave requests and
 * daily updates to a spreadsheet. All writes go through the integration job
 * queue (src/jobs) so failures are retried durably; nothing is written
 * directly from request handlers.
 *
 * No Google API calls are made from this scaffold and no placeholder success
 * is returned.
 */

export const googleSheetsAdapter = {
  /** Append a leave request row. Planned to run only from the job worker. */
  appendLeaveRequest(): never {
    throw new UnimplementedError('google-sheets.appendLeaveRequest');
  },

  /** Append a daily update row. Planned to run only from the job worker. */
  appendDailyUpdate(): never {
    throw new UnimplementedError('google-sheets.appendDailyUpdate');
  },
};
