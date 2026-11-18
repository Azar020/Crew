// ─── Crew Time, Date & Timezone Utilities ──────────────────────────────────────

/**
 * Extract clean user initials (e.g. "Azar" -> "AZ", "Alex Williams" -> "AW")
 */
export function getInitials(name) {
  if (!name || typeof name !== 'string') return 'U';
  const trimmed = name.trim();
  if (!trimmed) return 'U';
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Standard supported timezones across Crew
 */
export const TIMEZONE_OPTIONS = [
  {
    id: 'Asia/Kolkata (IST)',
    iana: 'Asia/Kolkata',
    code: 'IST',
    offset: 'UTC+5:30',
    label: 'Asia/Kolkata (IST • UTC+5:30)',
  },
  {
    id: 'Africa/Lagos (WAT)',
    iana: 'Africa/Lagos',
    code: 'WAT',
    offset: 'UTC+1:00',
    label: 'Africa/Lagos (WAT • UTC+1:00)',
  },
  {
    id: 'America/New_York (EST)',
    iana: 'America/New_York',
    code: 'EST/EDT',
    offset: 'UTC-5:00',
    label: 'America/New_York (EST • UTC-5:00)',
  },
  {
    id: 'Europe/London (GMT)',
    iana: 'Europe/London',
    code: 'GMT/BST',
    offset: 'UTC+0:00',
    label: 'Europe/London (GMT • UTC+0:00)',
  },
  {
    id: 'Asia/Dubai (GST)',
    iana: 'Asia/Dubai',
    code: 'GST',
    offset: 'UTC+4:00',
    label: 'Asia/Dubai (GST • UTC+4:00)',
  },
];

/**
 * Resolve an IANA timezone string from a saved preference or browser default
 */
export function resolveIanaTimezone(tzString) {
  if (!tzString) {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';
    } catch {
      return 'Asia/Kolkata';
    }
  }
  const match = TIMEZONE_OPTIONS.find(
    (t) => t.id === tzString || t.iana === tzString || t.code === tzString
  );
  if (match) return match.iana;
  return tzString;
}

/**
 * Retrieve timezone metadata (code, offset, label)
 */
export function getTimezoneMeta(tzString) {
  const iana = resolveIanaTimezone(tzString);
  const match = TIMEZONE_OPTIONS.find((t) => t.iana === iana || t.id === tzString);
  if (match) return match;
  return {
    id: iana,
    iana,
    code: 'LOCAL',
    offset: 'Local',
    label: iana,
  };
}

/**
 * Format time in a specific timezone with daylight-saving time handling
 */
export function formatTimeInTz(date, timeZone, options = {}) {
  if (!date) return '—';
  const targetDate = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  if (isNaN(targetDate.getTime())) return '—';

  const resolvedTz = resolveIanaTimezone(timeZone);

  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: resolvedTz,
      hour: '2-digit',
      minute: '2-digit',
      second: options.showSeconds ? '2-digit' : undefined,
      hour12: true,
      ...options,
    }).format(targetDate);
  } catch (err) {
    console.warn(`Timezone format error for ${resolvedTz}:`, err);
    return targetDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
}

/**
 * Format a Date object for display
 */
export const formatTime = (date, timezone = null) => {
  if (!date) return '—';
  if (timezone) return formatTimeInTz(date, timezone);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

export const formatDate = (date = new Date(), timeZone = null) => {
  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  const resolvedTz = timeZone ? resolveIanaTimezone(timeZone) : undefined;
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'long',
    day: 'numeric',
    timeZone: resolvedTz,
  }).format(d);
};
