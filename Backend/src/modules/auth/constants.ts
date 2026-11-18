/**
 * Fixed company authentication policy. These are company-level decisions and
 * are intentionally NOT configurable via environment variables: mixing
 * untrusted domains in through configuration would be a security risk.
 */

/**
 * Exact email domains accepted at login. A candidate email must belong to one
 * of these domains exactly (no subdomains). This is checked independently of
 * the Google `hd` claim.
 */
export const ALLOWED_EMAIL_DOMAINS = ['transacty.ai', 'n23digitals.com'] as const;

/**
 * Domains allowed for the controlled first-admin bootstrap script. Kept in
 * sync with ALLOWED_EMAIL_DOMAINS by design.
 */
export const BOOTSTRAP_ALLOWED_EMAIL_DOMAINS = ALLOWED_EMAIL_DOMAINS;

/** OAuth login transactions live for five minutes, then expire. */
export const OAUTH_TRANSACTION_TTL_SECONDS = 300;

/** Entropy for session and OAuth-transaction cookie tokens (>= 32 bytes). */
export const SESSION_TOKEN_BYTES = 32;
