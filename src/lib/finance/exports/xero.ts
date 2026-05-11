/**
 * Xero CSV export (Manual Journals format).
 *
 * Xero's "Manual journals" import expects this column shape:
 *   Narration, Date, Description, AccountCode, TaxRate, Amount, TrackingName1, TrackingOption1, TrackingName2, TrackingOption2
 *
 * One row per journal LINE; the Narration + Date repeat across the lines of
 * one entry so Xero can group them. Amount is positive for debits, negative
 * for credits.
 *
 * Reference: https://central.xero.com/s/article/Import-and-export-manual-journals
 */

import { listJournalEntries } from '../store';
import type { ListOpts } from '../store';
import { toCsv } from '../csv';

export function buildXeroCsv(opts: ListOpts = {}): string {
  const entries = listJournalEntries(opts).filter(e => !e.supersededBy);
  type Row = {
    narration: string;
    date: string;
    description: string;
    accountCode: string;
    taxRate: string;
    amount: string;
  };

  const rows: Row[] = [];
  for (const e of entries) {
    const narration = `${e.vendor ?? '—'}: ${e.memo}`.slice(0, 200);
    const desc = e.memo;
    const dateUk = e.serviceDate.split('-').reverse().join('/'); // DD/MM/YYYY for Xero EU; consider locale toggle later
    for (const line of e.lines) {
      const amountCents = line.debitCents - line.creditCents; // positive = debit
      rows.push({
        narration,
        date: dateUk,
        description: desc,
        accountCode: line.account,
        taxRate: 'No Tax',
        amount: (amountCents / 100).toFixed(2),
      });
    }
  }

  return toCsv(rows, [
    { header: 'Narration',   value: r => r.narration },
    { header: 'Date',        value: r => r.date },
    { header: 'Description', value: r => r.description },
    { header: 'AccountCode', value: r => r.accountCode },
    { header: 'TaxRate',     value: r => r.taxRate },
    { header: 'Amount',      value: r => r.amount },
  ]);
}
