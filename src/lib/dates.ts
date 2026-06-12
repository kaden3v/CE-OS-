/**
 * Business-timezone date helpers for the Finances section.
 *
 * The nursery operates in Arizona (America/Phoenix), which does NOT observe
 * daylight saving — a stable UTC-7 year-round. Date *defaults* and date-only
 * *display* must be computed in this zone, not UTC.
 *
 * The bug these fix: `new Date().toISOString().slice(0, 10)` returns the UTC
 * calendar date. After ~5pm Phoenix the UTC date has already rolled to
 * tomorrow, so an expense logged in the evening defaulted to the wrong day.
 *
 * Use these for calendar dates (occurred_on, run_on, started_on, trip_date).
 * Do NOT use them to write timestamptz instants (created_at, updated_at): for a
 * true instant, `new Date().toISOString()` is already correct.
 */

export const BUSINESS_TZ = "America/Phoenix";

/** `Intl` with `en-CA` yields an ISO-shaped YYYY-MM-DD, which we slice from. */
const isoFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: BUSINESS_TZ });

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** Today's calendar date (YYYY-MM-DD) in the business timezone. */
export function todayISO(): string {
  return isoFormatter.format(new Date());
}

/** First day of the current month (YYYY-MM-DD) in the business timezone. */
export function monthStartISO(): string {
  return `${todayISO().slice(0, 7)}-01`;
}

/** First day of the current year (YYYY-MM-DD) in the business timezone. */
export function yearStartISO(): string {
  return `${todayISO().slice(0, 4)}-01-01`;
}

/** Current calendar year in the business timezone. */
export function currentYear(): number {
  return Number(todayISO().slice(0, 4));
}

/**
 * Calendar year for a value. Date-only strings are read literally (no shift);
 * timestamps are resolved in the business timezone. Returns null if unparseable.
 */
export function isoYear(value: string | Date | null | undefined): number | null {
  if (!value) return null;
  if (typeof value === "string" && DATE_ONLY.test(value)) return Number(value.slice(0, 4));
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return null;
  return Number(isoFormatter.format(d).slice(0, 4));
}

/**
 * Display a date. Date-only strings render as the literal calendar date with no
 * timezone shift; full timestamps render in the business timezone.
 */
export function formatBusinessDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  if (typeof value === "string" && DATE_ONLY.test(value)) {
    const [y, m, d] = value.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString();
  }
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { timeZone: BUSINESS_TZ });
}

/** Short month label ("Jan"…"Dec") for a date-only string or timestamp. */
export function businessMonthShort(value: string | Date | null | undefined): string {
  if (!value) return "";
  if (typeof value === "string" && DATE_ONLY.test(value)) {
    const [y, m, d] = value.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleString("en-US", { month: "short" });
  }
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-US", { month: "short", timeZone: BUSINESS_TZ });
}

/**
 * Normalize a value to a YYYY-MM-DD calendar date for export. Date-only strings
 * pass through unchanged; timestamps are resolved in the business timezone.
 */
export function toBusinessISODate(value: string | Date | null | undefined): string {
  if (!value) return "";
  if (typeof value === "string" && DATE_ONLY.test(value)) return value;
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  return isoFormatter.format(d);
}
