/**
 * Date/time conventions:
 * - Stored instants: ISO 8601 UTC ending with `Z` only (never ambiguous local strings).
 * - Date-only fields (`shipDate`, `expectedArrival`, license expiry): `YYYY-MM-DD` civil date, no TZ suffix.
 * - Display uses the operator IANA timezone ({@link DEFAULT_OPERATOR_TIMEZONE} by default).
 *
 * Shipping UI mock copy (Dashboard / Shipping) stresses Monday-centric dispatch and heat holds.
 * {@link isShippingWindowSafe} encodes operational rules: Jun–Aug = Mon–Wed only;
 * Dec–Feb = Mon–Fri (differs from summer); other months = Mon–Fri.
 */

import { addDays, format, parse, parseISO } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { isUsFederalHolidayYmd } from "@/lib/usFederalHolidays";

export const DEFAULT_OPERATOR_TIMEZONE = "America/Phoenix";

/** UTC “now” as ISO Z — single choke point for persisted timestamps. */
export function utcIsoNow(): string {
  return new Date().toISOString();
}

/** Normalize any parseable instant to ISO Z (throws if invalid). */
export function normalizeUtcIso(iso: string): string {
  const d = new Date(iso.trim());
  if (Number.isNaN(d.getTime())) {
    throw new RangeError(`Invalid instant string: ${iso}`);
  }
  return d.toISOString();
}

/**
 * Format a UTC ISO instant (or date-only `YYYY-MM-DD`) for display in the operator zone.
 */
export function formatLocal(
  isoOrYmd: string,
  fmt = "PPpp",
  timeZone: string = DEFAULT_OPERATOR_TIMEZONE
): string {
  const s = isoOrYmd.trim();
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(s);
  const base = dateOnly
    ? parseISO(`${s}T12:00:00.000Z`)
    : parseISO(normalizeUtcIso(s));
  return formatInTimeZone(base, timeZone, fmt);
}

/**
 * Parse operator-local wall time (`input` + `fmt`) as occurring in `timeZone`, return UTC ISO Z.
 * Uses calendar components from `parse` + {@link fromZonedTime} (see date-fns-tz docs).
 */
export function parseLocalDateTime(
  input: string,
  fmt: string,
  timeZone: string = DEFAULT_OPERATOR_TIMEZONE
): string {
  const reference = new Date(2020, 0, 1);
  const wall = parse(input.trim(), fmt, reference);
  return fromZonedTime(wall, timeZone).toISOString();
}

/** Validate and return a date-only `YYYY-MM-DD` (no timezone; civil calendar date). */
export function parseLocalDate(input: string): string {
  const s = input.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    throw new RangeError(`Expected YYYY-MM-DD, got: ${input}`);
  }
  const [y, m, d] = s.split("-").map(Number);
  const constructed = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  if (
    constructed.getUTCFullYear() !== y ||
    constructed.getUTCMonth() !== m - 1 ||
    constructed.getUTCDate() !== d
  ) {
    throw new RangeError(`Invalid calendar date: ${input}`);
  }
  return s;
}

/** Calendar-day difference (b − a) using UTC noon anchors to avoid DST ambiguity. */
export function daysBetween(a: string, b: string): number {
  const da = parseISO(`${parseLocalDate(a)}T12:00:00.000Z`);
  const db = parseISO(`${parseLocalDate(b)}T12:00:00.000Z`);
  return Math.round((db.getTime() - da.getTime()) / 86_400_000);
}

/** Today’s calendar date in the operator timezone (`YYYY-MM-DD`). */
export function todayDateOnly(timeZone: string = DEFAULT_OPERATOR_TIMEZONE): string {
  return formatInTimeZone(new Date(), timeZone, "yyyy-MM-dd");
}

function addCalendarDaysYmd(ymd: string, delta: number): string {
  const base = parseISO(`${parseLocalDate(ymd)}T12:00:00.000Z`);
  return format(addDays(base, delta), "yyyy-MM-dd");
}

/** Monday = 1 … Sunday = 7 in civil calendar for `YYYY-MM-DD`. */
function isoWeekdayYmd(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  const dowJs = new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).getUTCDay();
  return dowJs === 0 ? 7 : dowJs;
}

function isWeekendYmd(ymd: string): boolean {
  const w = isoWeekdayYmd(ymd);
  return w === 6 || w === 7;
}

export function isBusinessDayYmd(ymd: string): boolean {
  return !isWeekendYmd(ymd) && !isUsFederalHolidayYmd(ymd);
}

/**
 * The calendar date in `timeZone` reached after advancing `n` business days from today in that zone.
 * Weekends and US federal holidays are skipped (AZ-specific holidays not added).
 */
export function businessDaysFromNow(
  n: number,
  timeZone: string = DEFAULT_OPERATOR_TIMEZONE
): string {
  if (n < 0 || !Number.isFinite(n)) {
    throw new RangeError("businessDaysFromNow expects non-negative finite n");
  }
  let cursor = formatInTimeZone(new Date(), timeZone, "yyyy-MM-dd");
  for (let i = 0; i < n; i++) {
    cursor = addCalendarDaysYmd(cursor, 1);
    while (!isBusinessDayYmd(cursor)) {
      cursor = addCalendarDaysYmd(cursor, 1);
    }
  }
  return cursor;
}

/**
 * Live-plant ship safety by civil ship date (Phoenix operations; date-only).
 * Summer rule is stricter than Dashboard “next Monday” placeholder — narrow heat window wins per product spec.
 */
export function isShippingWindowSafe(date: string): {
  safe: boolean;
  reason?: string;
} {
  const ymd = parseLocalDate(date);
  const month = Number(ymd.slice(5, 7));
  const dow = isoWeekdayYmd(ymd);

  if (month >= 6 && month <= 8) {
    if (dow <= 3) return { safe: true };
    return {
      safe: false,
      reason:
        "Peak heat (Jun–Aug): ship Monday–Wednesday only (avoid Thu–Sun dwell in transit).",
    };
  }

  if (month === 12 || month <= 2) {
    if (dow <= 5) return { safe: true };
    return {
      safe: false,
      reason:
        "Winter: avoid Saturday–Sunday shipping (weekday Mon–Fri preferred for cold dwell).",
    };
  }

  if (dow <= 5) return { safe: true };
  return {
    safe: false,
    reason: "Ship Monday–Friday (weekend dispatch avoided this season).",
  };
}

/** Whole calendar days from today (operator TZ) until `expiresYmd` (date-only). */
export function calendarDaysUntilExpiry(
  expiresYmd: string,
  timeZone: string = DEFAULT_OPERATOR_TIMEZONE
): number {
  const today = todayDateOnly(timeZone);
  return daysBetween(today, parseLocalDate(expiresYmd));
}
