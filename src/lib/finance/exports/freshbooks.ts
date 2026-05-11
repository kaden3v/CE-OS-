/**
 * FreshBooks expenses CSV export.
 *
 * FreshBooks accepts an "Expenses" CSV with these columns:
 *   Date, Vendor, Notes, Subtotal, Tax 1 Type, Tax 1 Amount, Total, Category
 *
 * Per-expense; revenue (invoices) lives in a separate import. This exporter
 * skips revenue lines.
 *
 * Reference: https://www.freshbooks.com/hub/importing-expense-csv
 */

import { listJournalEntries } from '../store';
import { accountByCode } from '../accounts';
import { toCsv } from '../csv';
import type { ListOpts } from '../store';

// Map our GL accounts to FreshBooks category strings. The exact category
// names need to match what the user has set up in their FreshBooks workspace;
// these defaults cover the most common Schedule-C-aligned categories.
const CATEGORY_MAP: Record<string, string> = {
  '5001': 'Supplies',
  '5010': 'Supplies',
  '5020': 'Supplies',
  '6010': 'Advertising',
  '6020': 'Vehicles',
  '6030': 'Bank Charges',
  '6040': 'Contract Labor',
  '6050': 'Depreciation',
  '6060': 'Insurance',
  '6070': 'Interest',
  '6080': 'Professional Services',
  '6090': 'Office Expense',
  '6100': 'Rent',
  '6110': 'Repairs',
  '6120': 'Supplies',
  '6130': 'Taxes',
  '6140': 'Travel',
  '6150': 'Meals & Entertainment',
  '6160': 'Utilities',
  '6170': 'Postage',
  '6180': 'Subscriptions',
  '6190': 'Bank Charges',
  '6200': 'Home Office',
  '6900': 'Uncategorized Expense',
};

export function buildFreshBooksCsv(opts: ListOpts = {}): string {
  const entries = listJournalEntries(opts).filter(e => !e.supersededBy);
  type Row = {
    date: string;
    vendor: string;
    notes: string;
    subtotal: string;
    tax1Type: string;
    tax1Amount: string;
    total: string;
    category: string;
  };
  const rows: Row[] = [];

  for (const e of entries) {
    const expenseLine = e.lines.find(l => (l.account.startsWith('5') || l.account.startsWith('6')) && l.debitCents > 0);
    if (!expenseLine) continue; // skip revenue entries
    const acct = accountByCode(expenseLine.account);
    const total = (expenseLine.debitCents / 100).toFixed(2);
    rows.push({
      date: e.serviceDate,
      vendor: e.vendor ?? '—',
      notes: e.memo,
      subtotal: total,
      tax1Type: '',
      tax1Amount: '0.00',
      total,
      category: CATEGORY_MAP[expenseLine.account] ?? acct?.name ?? 'Uncategorized Expense',
    });
  }

  return toCsv(rows, [
    { header: 'Date',         value: r => r.date },
    { header: 'Vendor',       value: r => r.vendor },
    { header: 'Notes',        value: r => r.notes },
    { header: 'Subtotal',     value: r => r.subtotal },
    { header: 'Tax 1 Type',   value: r => r.tax1Type },
    { header: 'Tax 1 Amount', value: r => r.tax1Amount },
    { header: 'Total',        value: r => r.total },
    { header: 'Category',     value: r => r.category },
  ]);
}
