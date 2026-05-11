import type { PeriodSelection } from './types';

/**
 * Period math — all dates as YYYY-MM-DD strings.
 *
 * A single PeriodSelection is the unit of currency between PeriodPicker and
 * every consuming page (Expenses, Vendors, TaxReport, etc.). The `previous`
 * slot powers compare-to-prior deltas.
 */

export type PeriodKind = 'month' | 'quarter' | 'year' | 'custom' | 'mtd' | 'qtd' | 'ytd';

export type PeriodInput =
  | { kind: 'month'; year: number; month: number }       // month is 1-12
  | { kind: 'quarter'; year: number; quarter: 1 | 2 | 3 | 4 }
  | { kind: 'year'; year: number }
  | { kind: 'mtd' }
  | { kind: 'qtd' }
  | { kind: 'ytd'; fiscalYearStartMonth?: number }
  | { kind: 'custom'; start: string; end: string };

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function iso(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
function daysInMonth(y: number, m: number): number {
  return new Date(y, m, 0).getDate();
}
function today(): { y: number; m: number; d: number } {
  const t = new Date();
  return { y: t.getFullYear(), m: t.getMonth() + 1, d: t.getDate() };
}

export function resolve(input: PeriodInput): PeriodSelection {
  switch (input.kind) {
    case 'month': {
      const start = iso(input.year, input.month, 1);
      const end   = iso(input.year, input.month, daysInMonth(input.year, input.month));
      const prevM = input.month === 1 ? 12 : input.month - 1;
      const prevY = input.month === 1 ? input.year - 1 : input.year;
      return {
        current: { start, end, label: `${MONTHS_SHORT[input.month - 1]} ${input.year}` },
        previous: {
          start: iso(prevY, prevM, 1),
          end:   iso(prevY, prevM, daysInMonth(prevY, prevM)),
          label: `${MONTHS_SHORT[prevM - 1]} ${prevY}`,
        },
      };
    }
    case 'quarter': {
      const startMonth = (input.quarter - 1) * 3 + 1;
      const endMonth   = startMonth + 2;
      const start = iso(input.year, startMonth, 1);
      const end   = iso(input.year, endMonth, daysInMonth(input.year, endMonth));
      const prevQ = input.quarter === 1 ? 4 : (input.quarter - 1) as 1 | 2 | 3 | 4;
      const prevY = input.quarter === 1 ? input.year - 1 : input.year;
      const prevStartMonth = (prevQ - 1) * 3 + 1;
      const prevEndMonth   = prevStartMonth + 2;
      return {
        current:  { start, end, label: `Q${input.quarter} ${input.year}` },
        previous: {
          start: iso(prevY, prevStartMonth, 1),
          end:   iso(prevY, prevEndMonth, daysInMonth(prevY, prevEndMonth)),
          label: `Q${prevQ} ${prevY}`,
        },
      };
    }
    case 'year': {
      return {
        current:  { start: iso(input.year, 1, 1),     end: iso(input.year, 12, 31),     label: `${input.year}` },
        previous: { start: iso(input.year - 1, 1, 1), end: iso(input.year - 1, 12, 31), label: `${input.year - 1}` },
      };
    }
    case 'mtd': {
      const t = today();
      return {
        current: { start: iso(t.y, t.m, 1), end: iso(t.y, t.m, t.d), label: `${MONTHS_SHORT[t.m - 1]} ${t.y} MTD` },
        previous: {
          start: iso(t.m === 1 ? t.y - 1 : t.y, t.m === 1 ? 12 : t.m - 1, 1),
          end:   iso(t.m === 1 ? t.y - 1 : t.y, t.m === 1 ? 12 : t.m - 1, t.d),
          label: 'prev. month-to-date',
        },
      };
    }
    case 'qtd': {
      const t = today();
      const q = Math.ceil(t.m / 3);
      const startMonth = (q - 1) * 3 + 1;
      return {
        current: { start: iso(t.y, startMonth, 1), end: iso(t.y, t.m, t.d), label: `Q${q} ${t.y} QTD` },
        previous: null,
      };
    }
    case 'ytd': {
      const t = today();
      const fyStart = input.fiscalYearStartMonth ?? 1;
      // If we're after the FY start month, the current FY started this calendar year.
      // Otherwise it started last calendar year.
      const fyYear = t.m >= fyStart ? t.y : t.y - 1;
      const fyLabel = fyStart === 1 ? `${fyYear} YTD` : `FY${fyYear} YTD`;
      const prevLabel = fyStart === 1 ? `${fyYear - 1} YTD` : `FY${fyYear - 1} YTD`;
      return {
        current:  { start: iso(fyYear,     fyStart, 1), end: iso(t.y, t.m, t.d),     label: fyLabel },
        previous: { start: iso(fyYear - 1, fyStart, 1), end: iso(t.y - 1, t.m, t.d), label: prevLabel },
      };
    }
    case 'custom': {
      return {
        current: { start: input.start, end: input.end, label: `${input.start} → ${input.end}` },
        previous: null,
      };
    }
  }
}

/** Default selection on first page load. Pass the fiscal-year start month from settings to honor a non-calendar fiscal year. */
export function defaultPeriod(fiscalYearStartMonth = 1): PeriodSelection {
  return resolve({ kind: 'ytd', fiscalYearStartMonth });
}

export function withinPeriod(date: string, period: { start: string; end: string }): boolean {
  return date >= period.start && date <= period.end;
}

/** Percent change between two cent totals; null if `prev` is 0 (avoid div by 0). */
export function pctChange(curr: number, prev: number): number | null {
  if (prev === 0) return null;
  return ((curr - prev) / Math.abs(prev)) * 100;
}
