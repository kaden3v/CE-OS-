/**
 * Finance domain types — the shape of CE OS bookkeeping.
 *
 * Two ideas that drive everything:
 *
 *  1. Journal entries are immutable. To "edit" a transaction you post a
 *     correcting entry that supersedes the original. The original is never
 *     mutated, so the audit trail is the data, not a separate log.
 *
 *  2. Cash vs accrual is a runtime toggle (`AccountingMethod`). Every
 *     transaction stores both `serviceDate` (when the work happened) and
 *     `cashDate` (when money moved). The active method picks which date
 *     period filters use.
 *
 * The chart of accounts uses 4-digit numeric GL codes that map to IRS
 * Schedule C line items, so the tax report flows directly from the ledger.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Chart of accounts
// ─────────────────────────────────────────────────────────────────────────────

export type AccountType = 'revenue' | 'cogs' | 'expense' | 'asset' | 'liability' | 'equity';

export type Account = {
  /** 4-digit GL code, e.g. "5010" for Cost of Media. */
  code: string;
  name: string;
  type: AccountType;
  /** Parent code for the group header row in the chart of accounts view. */
  parent?: string;
  /** IRS Schedule C line number this account rolls up to, when applicable. */
  scheduleC?: string;
  /** Active accounts show up in selectors; inactive ones only in historical data. */
  active: boolean;
};

// ─────────────────────────────────────────────────────────────────────────────
// Journal entries (immutable)
// ─────────────────────────────────────────────────────────────────────────────

export type JournalLine = {
  /** GL account code. */
  account: string;
  /** Positive for debit, 0 if credit-only on this line. Units = cents to avoid float drift. */
  debitCents: number;
  /** Positive for credit, 0 if debit-only on this line. */
  creditCents: number;
  /** Optional memo override at the line level. */
  memo?: string;
};

export type JournalEntry = {
  id: string;
  /** Date the underlying business event happened (delivery, work performed). */
  serviceDate: string; // ISO YYYY-MM-DD
  /** Date money moved (or null if not yet — useful for accrual). */
  cashDate: string | null; // ISO YYYY-MM-DD or null
  /** Free-text description. */
  memo: string;
  /** Vendor / counterparty if applicable. */
  vendor?: string;
  /** Channel — Shopify / Etsy / Manual / Bank. Helps reconciliation. */
  channel?: 'Shopify' | 'Etsy' | 'Bank' | 'Manual';
  /** Lines must balance: sum(debits) === sum(credits). */
  lines: JournalLine[];
  /** Reconciliation state for this transaction. */
  reconciliation: ReconciliationStatus;
  /** Receipt / invoice attachment URLs (S3 / blob storage in prod). */
  attachments: string[];

  // ── Audit fields ─────────────────────────────────────────────────────────
  /** Who posted the entry. */
  createdBy: string;
  /** When the entry was posted (server timestamp). Immutable. */
  createdAt: string; // ISO timestamp
  /** If this entry was posted to supersede another, the prior entry's id. */
  supersedes?: string;
  /** Reason given when posting a correction (required for supersedes). */
  correctionReason?: string;
  /** If this entry has BEEN superseded, the id of the entry that replaced it. */
  supersededBy?: string;
};

export type ReconciliationStatus =
  | { state: 'unreconciled' }
  | { state: 'matched'; matchedTo: string; matchedAt: string; matchedBy: string; confidence?: number }
  | { state: 'reviewed'; reviewedAt: string; reviewedBy: string }
  | { state: 'disputed'; reason: string; flaggedAt: string; flaggedBy: string };

// ─────────────────────────────────────────────────────────────────────────────
// Fiscal periods + accounting method
// ─────────────────────────────────────────────────────────────────────────────

export type AccountingMethod = 'cash' | 'accrual';

export type FiscalPeriod = {
  /** YYYY-MM for a month period, YYYY-Q1..Q4 for quarter, YYYY for full year. */
  id: string;
  kind: 'month' | 'quarter' | 'year';
  /** Inclusive start date. */
  start: string;
  /** Inclusive end date. */
  end: string;
  /** open: edits allowed. closed: no new entries; corrections only. locked: read-only. */
  status: 'open' | 'closed' | 'locked';
  /** When the period was closed and by whom. */
  closedAt?: string;
  closedBy?: string;
};

// Convenience for "the period a user is viewing right now" — drives every
// stat tile and chart. Includes a `compare` slot for prev-period deltas.
export type PeriodSelection = {
  current: { start: string; end: string; label: string };
  previous: { start: string; end: string; label: string } | null;
};

// ─────────────────────────────────────────────────────────────────────────────
// Derived projections — what UI components consume
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A "transaction" is the user-facing flat projection of a journal entry that
 * touches an expense account: one row per JE, with the expense side surfaced.
 * Pages should consume this shape, not raw JournalEntry, so the underlying
 * double-entry model stays an implementation detail.
 */
export type TransactionView = {
  id: string;
  journalId: string;          // back-reference for drill-down
  date: string;               // serviceDate or cashDate depending on method
  account: string;            // GL code
  accountName: string;        // resolved label
  vendor: string;
  channel: JournalEntry['channel'];
  memo: string;
  amountCents: number;        // positive for expense, negative for refund
  deductible: boolean;        // true if account.scheduleC is set
  reconciliation: ReconciliationStatus['state'];
  hasReceipt: boolean;
  superseded: boolean;        // true if a newer entry has replaced this one
  createdBy: string;
  createdAt: string;
};

export function formatCents(cents: number): string {
  const dollars = cents / 100;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(dollars);
}
