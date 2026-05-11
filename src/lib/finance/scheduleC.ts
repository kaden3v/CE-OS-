/**
 * Schedule C draft generator.
 *
 * Aggregates the ledger by Schedule C line item for a given period. Output is
 * a row per Schedule C line with the GL accounts contributing to it. Suitable
 * for CSV export, and the basis for a PDF generator in Pass 4.
 *
 * Note: this is a *draft*. Always have a CPA review before filing.
 */

import { CHART_OF_ACCOUNTS } from './accounts';
import { totalsByAccount, revenueTotalCents } from './store';
import type { ListOpts } from './store';

// Schedule C 2024 form line labels — kept in one place so they update when
// the IRS form changes.
const LINE_LABELS: Record<string, string> = {
  '1':   'Gross receipts or sales',
  '2':   'Returns and allowances',
  '8':   'Advertising',
  '9':   'Car and truck expenses',
  '10':  'Commissions and fees',
  '11':  'Contract labor',
  '13':  'Depreciation',
  '15':  'Insurance (other than health)',
  '16b': 'Interest — other',
  '17':  'Legal and professional services',
  '18':  'Office expense',
  '20b': 'Rent — other business property',
  '21':  'Repairs and maintenance',
  '22':  'Supplies',
  '23':  'Taxes and licenses',
  '24a': 'Travel',
  '24b': 'Deductible meals (50%)',
  '25':  'Utilities',
  '30':  'Expenses for business use of home',
  '36':  'Purchases (less COGS)',
  '38':  'Materials and supplies (COGS)',
  '48':  'Other expenses',
};

export type ScheduleCLine = {
  line: string;
  label: string;
  cents: number;
  accounts: Array<{ code: string; name: string; cents: number }>;
};

export function buildScheduleC(opts: ListOpts = {}): {
  revenueCents: number;
  lines: ScheduleCLine[];
  totalDeductionsCents: number;
  netProfitCents: number;
} {
  const revenueCents = revenueTotalCents({ period: opts.period, method: opts.method });
  const totals = totalsByAccount(opts);

  // Group GL accounts by their Schedule C line.
  const grouped = new Map<string, ScheduleCLine>();
  for (const t of totals.values()) {
    const sc = CHART_OF_ACCOUNTS.find(a => a.code === t.code)?.scheduleC;
    if (!sc) continue;
    const existing = grouped.get(sc) ?? { line: sc, label: LINE_LABELS[sc] ?? `Line ${sc}`, cents: 0, accounts: [] };
    existing.cents += t.cents;
    existing.accounts.push({ code: t.code, name: t.name, cents: t.cents });
    grouped.set(sc, existing);
  }

  const lines = Array.from(grouped.values()).sort((a, b) => a.line.localeCompare(b.line));
  // Sort each line's contributors largest-first.
  for (const l of lines) l.accounts.sort((a, b) => b.cents - a.cents);

  const totalDeductionsCents = lines.reduce((s, l) => s + l.cents, 0);

  return {
    revenueCents,
    lines,
    totalDeductionsCents,
    netProfitCents: revenueCents - totalDeductionsCents,
  };
}

/** Schedule-C-shaped CSV. One row per line, with contributing accounts in a JSON-ish detail column. */
export function scheduleCCsvRows(s: ReturnType<typeof buildScheduleC>) {
  const rows: Array<{ line: string; label: string; amount: string; detail: string }> = [];
  rows.push({ line: '1',   label: 'Gross receipts or sales',     amount: (s.revenueCents / 100).toFixed(2),       detail: '' });
  for (const l of s.lines) {
    rows.push({
      line: l.line,
      label: l.label,
      amount: (l.cents / 100).toFixed(2),
      detail: l.accounts.map(a => `${a.code} ${a.name} $${(a.cents/100).toFixed(2)}`).join('; '),
    });
  }
  rows.push({ line: '28',  label: 'Total expenses',              amount: (s.totalDeductionsCents / 100).toFixed(2), detail: '' });
  rows.push({ line: '31',  label: 'Net profit or (loss)',        amount: (s.netProfitCents     / 100).toFixed(2), detail: '' });
  return rows;
}
