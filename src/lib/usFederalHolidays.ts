/**
 * US federal holidays by calendar date (America civic calendar).
 * Does not model “observed” Monday/Friday shifts — sufficient for business-day counting.
 */

const FIXED = (y: number) =>
  new Set([
    `${y}-01-01`,
    `${y}-06-19`,
    `${y}-07-04`,
    `${y}-11-11`,
    `${y}-12-25`,
  ]);

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Monday = 1 … Sunday = 7 (ISO weekday, Mon-first) */
function isoWeekdayUtc(year: number, month: number, day: number): number {
  const d = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const js = d.getUTCDay();
  return js === 0 ? 7 : js;
}

/** nth weekday (1=Mon … 7=Sun) in month */
function nthWeekdayOfMonth(
  year: number,
  month: number,
  weekdayIso: number,
  n: number
): string {
  let seen = 0;
  const dim = daysInMonth(year, month);
  for (let day = 1; day <= dim; day++) {
    if (isoWeekdayUtc(year, month, day) !== weekdayIso) continue;
    seen++;
    if (seen === n) {
      const mm = String(month).padStart(2, "0");
      const dd = String(day).padStart(2, "0");
      return `${year}-${mm}-${dd}`;
    }
  }
  throw new Error(`nth weekday not found ${year}-${month}`);
}

function lastWeekdayOfMonth(
  year: number,
  month: number,
  weekdayIso: number
): string {
  const dim = daysInMonth(year, month);
  for (let day = dim; day >= 1; day--) {
    if (isoWeekdayUtc(year, month, day) === weekdayIso) {
      const mm = String(month).padStart(2, "0");
      const dd = String(day).padStart(2, "0");
      return `${year}-${mm}-${dd}`;
    }
  }
  throw new Error(`last weekday not found ${year}-${month}`);
}

/** 4th Thursday of November */
function thanksgiving(year: number): string {
  return nthWeekdayOfMonth(year, 11, 4, 4);
}

/** Set of `YYYY-MM-DD` federal holiday dates for `year`. */
export function getUsFederalHolidayDates(year: number): Set<string> {
  const s = FIXED(year);
  s.add(nthWeekdayOfMonth(year, 1, 1, 3)); // MLK
  s.add(nthWeekdayOfMonth(year, 2, 1, 3)); // Presidents
  s.add(lastWeekdayOfMonth(year, 5, 1)); // Memorial
  s.add(nthWeekdayOfMonth(year, 9, 1, 1)); // Labor
  s.add(nthWeekdayOfMonth(year, 10, 1, 2)); // Columbus
  s.add(thanksgiving(year));
  return s;
}

export function isUsFederalHolidayYmd(ymd: string): boolean {
  const y = Number(ymd.slice(0, 4));
  if (!Number.isFinite(y)) return false;
  return getUsFederalHolidayDates(y).has(ymd);
}
