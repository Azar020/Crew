import { UnimplementedError } from '../../shared/errors.js';

/**
 * STUB — email adapter. NOT IMPLEMENTED, no credentials required yet.
 *
 * Planned: manager notification emails after attendance events. The recipient
 * ("manager") is only an email target derived from employee data — not a
 * login role. Sending goes through the integration job queue (src/jobs) so
 * failures are retried durably; nothing is sent directly from request
 * handlers.
 *
 * No SMTP or provider API calls are made from this scaffold and no placeholder
 * success is returned.
 */

export const emailAdapter = {
  /** Send a manager notification after an attendance event. */
  sendManagerNotification(): never {
    throw new UnimplementedError('email.sendManagerNotification');
  },
};
