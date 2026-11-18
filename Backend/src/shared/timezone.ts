import { sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { AppError } from './errors.js';

/**
 * IANA timezone identifiers, validated against BOTH catalogs that must agree:
 * the Node.js/ICU zone data the application derives dates with, and the
 * PostgreSQL zone catalog (`pg_timezone_names`) that stores and converts
 * timestamps. Abbreviations ("IST"), fixed offsets ("+05:30") and unknown
 * names are rejected; real IANA names — including future-country zones and
 * legacy aliases both catalogs resolve (Asia/Kolkata, Asia/Calcutta) — pass.
 */

// `Intl.supportedValuesOf` only lists ICU's legacy-canonical names
// (e.g. Asia/Calcutta), while Intl.DateTimeFormat resolves current IANA
// names (e.g. Asia/Kolkata) as aliases. Resolving the zone is exactly what
// the application needs, so that is the application-side check.
const formatCache = new Map<string, boolean>();

/** True when the Node.js ICU data can format dates in this zone (cached). */
export function applicationSupportsTimezone(timezone: string): boolean {
  const cached = formatCache.get(timezone);
  if (cached !== undefined) return cached;
  let supported = false;
  try {
    // Throws RangeError for unknown zones and abbreviations; resolves any
    // IANA name or alias in the runtime's tz data.
    new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: '2-digit' });
    supported = true;
  } catch {
    supported = false;
  }
  formatCache.set(timezone, supported);
  return supported;
}

export const ianaTimezoneSchema = z.string().trim().min(1).max(100)
  // Fixed offsets ("+05:30", "-08:00") are ICU convenience values, never IANA
  // identifiers; abbreviations ("IST") fail the resolve check below.
  .refine((value) => !/^[+-]/.test(value), 'Unsupported IANA timezone')
  .refine(applicationSupportsTimezone, 'Unsupported IANA timezone');

const postgresSupportCache = new Map<string, boolean>();

/** True when PostgreSQL itself recognizes the zone name (cached per process). */
export async function postgresSupportsTimezone(
  tx: { execute: (query: SQL) => Promise<{ rows: Array<{ ok: boolean }> }> },
  timezone: string,
): Promise<boolean> {
  const cached = postgresSupportCache.get(timezone);
  if (cached !== undefined) return cached;
  const result = await tx.execute(sql`
    SELECT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = ${timezone}) AS ok
  `);
  const ok = result.rows[0]?.ok === true;
  postgresSupportCache.set(timezone, ok);
  return ok;
}

/** A stored/configured timezone must be usable by both catalogs, or attendance
 * and provisioning fail closed with a clear configuration error. */
export async function assertSupportedTimezone(
  tx: Parameters<typeof postgresSupportsTimezone>[0],
  timezone: string,
  action: string,
): Promise<void> {
  if (!applicationSupportsTimezone(timezone) || !(await postgresSupportsTimezone(tx, timezone))) {
    throw new AppError(`${action} requires a work timezone supported by both the application and the database`, 400);
  }
}
