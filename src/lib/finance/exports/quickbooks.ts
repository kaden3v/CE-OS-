/**
 * QuickBooks IIF export.
 *
 * IIF (Intuit Interchange Format) is a tab-delimited bookkeeping export
 * format QuickBooks Desktop (and some Online imports) accept. Each
 * transaction is a !TRNS row followed by one or more !SPL split rows,
 * terminated with !ENDTRNS.
 *
 * Reference: https://quickbooks.intuit.com/learn-support/en-us/help-article/import-export-data/use-iif-import-data/L4OXP05ub_US_en_US
 *
 * Format:
 *   !ACCNT  NAME    ACCNTTYPE
 *   !TRNS   TRNSTYPE  DATE  ACCNT  AMOUNT  DOCNUM  MEMO  CLEAR
 *   !SPL    TRNSTYPE  DATE  ACCNT  AMOUNT  DOCNUM  MEMO  CLEAR
 *   !ENDTRNS
 *   ACCNT   "Operating Bank Account"  BANK
 *   TRNS    GENERAL JOURNAL  2025-05-08  Operating Bank Account  -145.00  JE-ABC  Sphagnum Moss Co. — LFS  N
 *   SPL     GENERAL JOURNAL  2025-05-08  Growing Media           145.00   JE-ABC  Sphagnum Moss Co. — LFS  N
 *   ENDTRNS
 *
 * Dates are MM/DD/YYYY for QuickBooks. Amounts: debits positive on TRNS,
 * credits negative on SPL (or the convention reversed — this exporter
 * uses TRNS for the bank/cash side and SPL for the expense side).
 */

import { CHART_OF_ACCOUNTS } from '../accounts';
import { listJournalEntries } from '../store';
import type { ListOpts } from '../store';
import type { JournalEntry } from '../types';

const TYPE_MAP: Record<string, string> = {
  asset: 'BANK',           // 1010/1020 → BANK; refine for 1100/1500 if needed
  liability: 'AP',
  equity: 'EQUITY',
  revenue: 'INC',
  cogs: 'COGS',
  expense: 'EXP',
};

function ymd(d: string): string {
  // d is YYYY-MM-DD; QB wants MM/DD/YYYY
  const [y, m, day] = d.split('-');
  return `${m}/${day}/${y}`;
}

function dollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

function tab(parts: Array<string | number>): string {
  return parts.map(p => String(p).replace(/\t/g, ' ').replace(/[\r\n]+/g, ' ')).join('\t');
}

export function buildQuickBooksIIF(opts: ListOpts = {}): string {
  const entries = listJournalEntries(opts).filter(e => !e.supersededBy);

  // 1. Account header
  const usedCodes = new Set<string>();
  for (const e of entries) for (const l of e.lines) usedCodes.add(l.account);
  const accounts = CHART_OF_ACCOUNTS.filter(a => usedCodes.has(a.code));

  const lines: string[] = [];
  lines.push(tab(['!ACCNT', 'NAME', 'ACCNTTYPE']));
  for (const a of accounts) {
    lines.push(tab(['ACCNT', a.name, TYPE_MAP[a.type] ?? 'EXP']));
  }

  // 2. Transactions
  lines.push(tab(['!TRNS', 'TRNSTYPE', 'DATE', 'ACCNT', 'AMOUNT', 'DOCNUM', 'MEMO']));
  lines.push(tab(['!SPL',  'TRNSTYPE', 'DATE', 'ACCNT', 'AMOUNT', 'DOCNUM', 'MEMO']));
  lines.push('!ENDTRNS');

  for (const e of entries) {
    writeJournalEntry(lines, e, accounts);
  }

  return lines.join('\n') + '\n';
}

function writeJournalEntry(out: string[], e: JournalEntry, accounts: Array<{ code: string; name: string }>): void {
  const lookup = new Map(accounts.map(a => [a.code, a.name]));
  const memo = (e.memo || '').replace(/[\r\n\t]+/g, ' ');
  const date = ymd(e.serviceDate);

  // The "primary" line for IIF is the credit side for an expense (the cash
  // account); the splits are the debit side (the expense account). In a
  // simple two-line expense entry, the credit line is the 1010 Bank.
  const debit  = e.lines.find(l => l.debitCents  > 0);
  const credit = e.lines.find(l => l.creditCents > 0);
  if (!debit || !credit) return;

  // TRNS = credit side (negative amount per QB convention for a payment)
  out.push(tab([
    'TRNS', 'GENERAL JOURNAL', date, lookup.get(credit.account) ?? credit.account,
    '-' + dollars(credit.creditCents), e.id, memo,
  ]));
  // SPL = debit side
  out.push(tab([
    'SPL', 'GENERAL JOURNAL', date, lookup.get(debit.account) ?? debit.account,
    dollars(debit.debitCents), e.id, memo,
  ]));
  out.push('ENDTRNS');
}
