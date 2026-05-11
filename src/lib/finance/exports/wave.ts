/**
 * Wave bookkeeping CSV export — "Transactions" import format.
 *
 * Wave's manual transaction import expects:
 *   Date, Description, Amount, Account
 *
 * Wave doesn't have a double-entry import endpoint, so this exporter
 * flattens each journal entry's "main side" (the expense line for an
 * expense entry, the revenue line for a revenue entry). Cash side is
 * implicit (Wave routes transactions through your configured bank).
 */

import { listJournalEntries } from '../store';
import { accountName } from '../accounts';
import { toCsv } from '../csv';
import type { ListOpts } from '../store';

export function buildWaveCsv(opts: ListOpts = {}): string {
  const entries = listJournalEntries(opts).filter(e => !e.supersededBy);
  type Row = { date: string; description: string; amount: string; account: string };
  const rows: Row[] = [];

  for (const e of entries) {
    const expense = e.lines.find(l => l.account.startsWith('5') || l.account.startsWith('6'));
    const revenue = e.lines.find(l => l.account.startsWith('4') && l.creditCents > 0);
    if (expense) {
      rows.push({
        date: e.serviceDate,
        description: `${e.vendor ?? ''}: ${e.memo}`.trim().slice(0, 200),
        amount: `-${(expense.debitCents / 100).toFixed(2)}`,        // Wave: outflow negative
        account: accountName(expense.account),
      });
    } else if (revenue) {
      rows.push({
        date: e.serviceDate,
        description: `${e.vendor ?? ''}: ${e.memo}`.trim().slice(0, 200),
        amount: (revenue.creditCents / 100).toFixed(2),              // Wave: inflow positive
        account: accountName(revenue.account),
      });
    }
  }

  return toCsv(rows, [
    { header: 'Date',        value: r => r.date },
    { header: 'Description', value: r => r.description },
    { header: 'Amount',      value: r => r.amount },
    { header: 'Account',     value: r => r.account },
  ]);
}
