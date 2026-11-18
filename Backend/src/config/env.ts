import { z } from 'zod';

/**
 * Validated environment configuration.
 *
 * Required: DATABASE_URL, PORT, HOST, NODE_ENV.
 *
 * Google authentication settings are required in production (startup fails
 * otherwise). In development/test they may be absent: real login then fails
 * closed with 503, while unrelated code paths (health checks) keep working.
 */
const rawSchema = z.object({
  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL is required (see .env.example)')
    .refine(
      (value) => value.startsWith('postgres://') || value.startsWith('postgresql://'),
      'DATABASE_URL must be a postgres:// or postgresql:// connection string',
    ),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().min(1).default('127.0.0.1'),
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  // Calendar policy for work dates and default holiday year (independent of host TZ).
  COMPANY_TIMEZONE: z.string().min(1).max(100).refine((value) => {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: value });
      return !/^[+-]/.test(value);
    } catch { return false; }
  }, 'COMPANY_TIMEZONE must be a valid IANA timezone').default('UTC'),

  // Google OpenID Connect authentication. Optional in development/test
  // (login fails closed without them); required in production.
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),

  /**
   * Allowed values of the signed `hd` (hosted domain) ID-token claim,
   * comma-separated. This is validated separately from the email domain:
   * a Workspace email domain and the `hd` value are not assumed identical.
   * Example: transacty.ai,n23digitals.com
   */
  GOOGLE_ALLOWED_HD: z.string().min(1).optional(),

  /**
   * The exact redirect URI registered in Google Cloud Console.
   * Default (local development): http://127.0.0.1:3000/auth/callback
   * Must be HTTPS in production.
   */
  OAUTH_REDIRECT_URI: z
    .string()
    .url()
    .default('http://127.0.0.1:3000/auth/callback'),

  /**
   * Exact Origins (scheme + host + port) allowed to make state-changing
   * requests and considered trusted post-login redirect destinations,
   * comma-separated. Redirect targets are ONLY taken from this list; never
   * from arbitrary request headers or query parameters.
   * Must be HTTPS-only in production.
   */
  AUTH_TRUSTED_ORIGINS: z
    .string()
    .min(1)
    .default('http://127.0.0.1:3000'),

  // Session lifetime defaults (minutes/hours). Activity never extends the
  // absolute expiry.
  SESSION_IDLE_MINUTES: z.coerce.number().int().min(1).max(1440).default(30),
  SESSION_ABSOLUTE_HOURS: z.coerce.number().int().min(1).max(720).default(12),

  // Google Sheets sync (optional, not implemented yet).
  GOOGLE_SHEETS_CREDENTIALS_PATH: z.string().min(1).optional(),
  GOOGLE_SHEETS_SPREADSHEET_ID: z.string().min(1).optional(),

  // Email notifications (optional, not implemented yet).
  SMTP_HOST: z.string().min(1).optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).optional(),
  SMTP_USER: z.string().min(1).optional(),
  SMTP_PASSWORD: z.string().min(1).optional(),
  MANAGER_NOTIFICATION_EMAIL: z.string().min(1).optional(),
});

const isProduction = process.env.NODE_ENV === 'production';

/**
 * Cross-field and security-critical production rules:
 * - production: full Google auth configuration is REQUIRED and must be HTTPS
 *   based (redirect URI, trusted origins). Insecure production
 *   authentication configuration fails startup.
 */
const envSchema = rawSchema
  .refine(
    (v) => !(isProduction && !(v.GOOGLE_CLIENT_ID && v.GOOGLE_CLIENT_SECRET)),
    {
      message:
        'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required in production',
    },
  )
  .refine(
    (v) => !(isProduction && !v.GOOGLE_ALLOWED_HD),
    {
      message: 'GOOGLE_ALLOWED_HD is required in production',
    },
  )
  .refine(
    (v) => !(isProduction && !v.OAUTH_REDIRECT_URI.startsWith('https://')),
    {
      message: 'OAUTH_REDIRECT_URI must be an https:// URL in production',
    },
  )
  .refine(
    (v) => {
      if (!isProduction) return true;
      const origins = v.AUTH_TRUSTED_ORIGINS.split(',').map((o) => o.trim());
      return origins.length > 0 && origins.every((o) => o.startsWith('https://'));
    },
    {
      message: 'AUTH_TRUSTED_ORIGINS must be https:// Origins in production',
    },
  );

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.') || '(env)'}: ${issue.message}`)
    .join('\n');
  // Intentional hard stop: a misconfigured backend must not start.
  throw new Error(`Invalid environment configuration:\n${details}`);
}

export const env = parsed.data;

/** Trusted origins as a normalized list. */
export function trustedOrigins(): string[] {
  return env.AUTH_TRUSTED_ORIGINS.split(',').map((origin) => origin.trim());
}

/** Allowed `hd` claim values as a normalized list. */
export function allowedHostedDomains(): string[] {
  return env.GOOGLE_ALLOWED_HD?.split(',').map((d) => d.trim()) ?? [];
}

/** The single configured trusted post-login redirect destination. */
export function postLoginRedirect(): string {
  return `${trustedOrigins()[0]}/`;
}

export type Env = typeof env;
