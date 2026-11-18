/**
 * Application roles. "Manager" is only an email notification recipient in
 * emails/integrations, never a backend role or auth subject.
 */
export const ROLES = ['admin', 'employee'] as const;

export type Role = (typeof ROLES)[number];
