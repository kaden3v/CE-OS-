/**
 * In-memory finance ledger — placeholder for the real backend.
 *
 * Honors the immutable-journal pattern: edits post a new JournalEntry with
 * `supersedes` set, never mutate the original. The store is the authoritative
 * source for "is this still the current version of the entry?"
 *
 * Reactive: every mutation bumps a version counter and notifies subscribers.
 * Pages use `useFinanceStore(selector)` to re-render automatically — no
 * manual refresh ticks.
 *
 * When the real backend lands, this module's public API stays the same; only
 * the implementation switches to `fetch('/api/finance/journal')`.
 */

import { useSyncExternalStore } from 'react';
import { accountByCode, accountName, expenseAccounts } from './accounts';
import { withinPeriod } from './period';
import type {
  JournalEntry, TransactionView, AccountingMethod, ReconciliationStatus,
  FiscalPeriod,
} from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Reactivity — subscribe pattern via useSyncExternalStore
// ─────────────────────────────────────────────────────────────────────────────

let version = 0;
const listeners = new Set<() => void>();
function bump() { version++; listeners.forEach(l => l()); }
function subscribe(l: () => void) { listeners.add(l); return () => listeners.delete(l); }
function getSnapshot() { return version; }

/**
 * React hook for components to react to store changes.
 * `selector` runs each render and returns the projection the component needs.
 *
 *   const txs = useFinanceStore(() => listTransactions({ period, method }));
 */
export function useFinanceStore<T>(selector: () => T): T {
  // useSyncExternalStore returns the version; we use it as a re-render trigger.
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return selector();
}

// ─────────────────────────────────────────────────────────────────────────────
// Seed data
// ─────────────────────────────────────────────────────────────────────────────

const now = () => new Date().toISOString();
const ymd = (offsetDays: number) => {
  const d = new Date();
  d.setDate(d.getDate() - offsetDays);
  return d.toISOString().split('T')[0];
};

function entry(
  partial: Omit<JournalEntry, 'id' | 'createdAt' | 'createdBy' | 'attachments' | 'reconciliation'> &
    Partial<Pick<JournalEntry, 'attachments' | 'reconciliation'>>,
): JournalEntry {
  return {
    id: `JE-${Math.random().toString(36).slice(2, 9).toUpperCase()}`,
    createdAt: now(),
    createdBy: 'Kaden',
    attachments: partial.attachments ?? [],
    reconciliation: partial.reconciliation ?? { state: 'unreconciled' },
    ...partial,
  };
}

// Helper: simple expense entry — debit an expense account, credit the bank.
function expenseEntry(opts: {
  serviceDate: string;
  cashDate: string | null;
  vendor: string;
  memo: string;
  accountCode: string;
  amountCents: number;
  channel?: JournalEntry['channel'];
  reconciliation?: ReconciliationStatus;
  hasReceipt?: boolean;
}): JournalEntry {
  return entry({
    serviceDate: opts.serviceDate,
    cashDate: opts.cashDate,
    vendor: opts.vendor,
    memo: opts.memo,
    channel: opts.channel ?? 'Bank',
    reconciliation: opts.reconciliation,
    attachments: opts.hasReceipt ? [`receipt-${Date.now()}.pdf`] : [],
    lines: [
      { account: opts.accountCode, debitCents: opts.amountCents, creditCents: 0 },
      { account: '1010',           debitCents: 0, creditCents: opts.amountCents }, // Operating Bank
    ],
  });
}

// Helper: simple revenue entry — debit the bank, credit a revenue account.
function revenueEntry(opts: {
  serviceDate: string;
  cashDate: string | null;
  channel: 'Shopify' | 'Etsy';
  revenueCode: string;
  amountCents: number;
  memo: string;
  vendor?: string;
}): JournalEntry {
  return entry({
    serviceDate: opts.serviceDate,
    cashDate: opts.cashDate,
    vendor: opts.vendor ?? opts.channel,
    memo: opts.memo,
    channel: opts.channel,
    reconciliation: { state: 'matched', matchedTo: `${opts.channel.toLowerCase()}-${opts.serviceDate}`, matchedAt: now(), matchedBy: opts.channel, confidence: 1.0 },
    lines: [
      { account: '1010',            debitCents: opts.amountCents, creditCents: 0 }, // Operating Bank
      { account: opts.revenueCode,  debitCents: 0, creditCents: opts.amountCents },
    ],
  });
}

let JOURNAL: JournalEntry[] = [
  // ── Revenue (so TaxReport has data to project) ────────────────────────────
  revenueEntry({ serviceDate: ymd(1),   cashDate: ymd(1),   channel: 'Shopify', revenueCode: '4001', amountCents: 24_500, memo: 'Order #1284 — P. Pirouette × 2' }),
  revenueEntry({ serviceDate: ymd(4),   cashDate: ymd(4),   channel: 'Shopify', revenueCode: '4001', amountCents: 18_200, memo: 'Order #1283' }),
  revenueEntry({ serviceDate: ymd(8),   cashDate: ymd(8),   channel: 'Etsy',    revenueCode: '4002', amountCents:  9_500, memo: 'Etsy order ESY-9912' }),
  revenueEntry({ serviceDate: ymd(15),  cashDate: ymd(15),  channel: 'Etsy',    revenueCode: '4002', amountCents: 12_400, memo: 'Etsy order ESY-9908' }),
  revenueEntry({ serviceDate: ymd(28),  cashDate: ymd(28),  channel: 'Shopify', revenueCode: '4001', amountCents: 36_500, memo: 'Bulk order — Marcus Aldana' }),
  revenueEntry({ serviceDate: ymd(45),  cashDate: ymd(45),  channel: 'Etsy',    revenueCode: '4002', amountCents:  8_400, memo: 'Etsy order ESY-9881' }),
  revenueEntry({ serviceDate: ymd(60),  cashDate: ymd(60),  channel: 'Shopify', revenueCode: '4001', amountCents: 41_200, memo: 'Spring sale batch' }),
  revenueEntry({ serviceDate: ymd(75),  cashDate: ymd(75),  channel: 'Etsy',    revenueCode: '4002', amountCents: 15_200, memo: 'Etsy order ESY-9854' }),
  revenueEntry({ serviceDate: ymd(95),  cashDate: ymd(95),  channel: 'Shopify', revenueCode: '4001', amountCents: 28_750, memo: 'Order #1265' }),
  revenueEntry({ serviceDate: ymd(120), cashDate: ymd(120), channel: 'Shopify', revenueCode: '4001', amountCents: 19_400, memo: 'Order #1241' }),
  // ── Expenses ──────────────────────────────────────────────────────────────
  expenseEntry({ serviceDate: ymd(2),  cashDate: ymd(2),  vendor: 'Sphagnum Moss Co.', memo: '2 bales of LFS',         accountCode: '5010', amountCents: 14_500, hasReceipt: true,  reconciliation: { state: 'matched',     matchedTo: 'bank-2025-05-08', matchedAt: now(), matchedBy: 'Plaid', confidence: 0.98 } }),
  expenseEntry({ serviceDate: ymd(5),  cashDate: ymd(5),  vendor: 'Amazon Business',  memo: 'Kraft mailers 100pk',      accountCode: '5020', amountCents:  4_850, hasReceipt: true,  reconciliation: { state: 'matched',     matchedTo: 'bank-2025-05-05', matchedAt: now(), matchedBy: 'Plaid', confidence: 1.0 } }),
  expenseEntry({ serviceDate: ymd(7),  cashDate: ymd(7),  vendor: 'USPS',             memo: 'Postage reload',            accountCode: '6170', amountCents: 31_240, hasReceipt: true,  reconciliation: { state: 'matched',     matchedTo: 'bank-2025-05-03', matchedAt: now(), matchedBy: 'Plaid', confidence: 0.95 } }),
  expenseEntry({ serviceDate: ymd(14), cashDate: ymd(14), vendor: 'SRP',              memo: 'Electricity — grow room',   accountCode: '6160', amountCents: 18_520, hasReceipt: true,  reconciliation: { state: 'reviewed',    reviewedAt: now(), reviewedBy: 'Kaden' } }),
  expenseEntry({ serviceDate: ymd(21), cashDate: ymd(21), vendor: 'Instagram Ads',    memo: 'Boosted post',              accountCode: '6010', amountCents:  2_500, hasReceipt: false, reconciliation: { state: 'unreconciled' } }),
  expenseEntry({ serviceDate: ymd(30), cashDate: ymd(30), vendor: 'AZ Dept of Ag',    memo: 'Nursery annual renewal',    accountCode: '6130', amountCents: 15_000, hasReceipt: true,  reconciliation: { state: 'matched',     matchedTo: 'bank-2025-04-10', matchedAt: now(), matchedBy: 'Plaid', confidence: 1.0 } }),
  expenseEntry({ serviceDate: ymd(45), cashDate: null,    vendor: 'Carnivero',        memo: '10 P. agnata wholesale',    accountCode: '5001', amountCents: 23_000, hasReceipt: false, reconciliation: { state: 'unreconciled' } }), // accrual: ordered but not paid
  expenseEntry({ serviceDate: ymd(60), cashDate: ymd(60), vendor: 'Shopify',          memo: 'May subscription',          accountCode: '6030', amountCents:  3_900, hasReceipt: true,  reconciliation: { state: 'matched',     matchedTo: 'bank-2025-04-01', matchedAt: now(), matchedBy: 'Plaid', confidence: 1.0 } }),
  expenseEntry({ serviceDate: ymd(90), cashDate: ymd(90), vendor: 'Etsy',             memo: 'Listing & transaction fees', accountCode: '6030', amountCents:  6_780, hasReceipt: false, reconciliation: { state: 'disputed',    reason: 'Etsy 1099-K mismatch — investigating', flaggedAt: now(), flaggedBy: 'Kaden' } }),
  expenseEntry({ serviceDate: ymd(120),cashDate: ymd(120),vendor: 'Miller Accounting',memo: '2024 tax prep',             accountCode: '6080', amountCents: 75_000, hasReceipt: true,  reconciliation: { state: 'matched',     matchedTo: 'bank-2025-02-15', matchedAt: now(), matchedBy: 'Plaid', confidence: 1.0 } }),
];

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export type ListOpts = {
  /** Period filter — uses `serviceDate` for accrual, `cashDate` for cash. */
  period?: { start: string; end: string };
  method?: AccountingMethod;
  /** Filter to one or more accounts (GL codes). */
  accounts?: string[];
  /** Filter to one or more vendors. */
  vendors?: string[];
  /** Reconciliation state filter. */
  reconciliation?: ReconciliationStatus['state'];
  /** Include superseded historical entries. Default false. */
  includeSuperseded?: boolean;
};

/** Return the active (non-superseded) journal entries matching filters. */
export function listJournalEntries(opts: ListOpts = {}): JournalEntry[] {
  const method = opts.method ?? 'accrual';
  return JOURNAL.filter(e => {
    if (!opts.includeSuperseded && e.supersededBy) return false;
    if (opts.period) {
      const refDate = method === 'cash' ? e.cashDate : e.serviceDate;
      if (!refDate) return false; // accrual w/ no service date or cash w/ unpaid
      if (!withinPeriod(refDate, opts.period)) return false;
    }
    if (opts.accounts?.length) {
      const accountsTouched = new Set(e.lines.map(l => l.account));
      if (!opts.accounts.some(a => accountsTouched.has(a))) return false;
    }
    if (opts.vendors?.length && (!e.vendor || !opts.vendors.includes(e.vendor))) return false;
    if (opts.reconciliation && e.reconciliation.state !== opts.reconciliation) return false;
    return true;
  });
}

/** Project journal entries into the user-facing flat shape Expenses uses. */
export function listTransactions(opts: ListOpts = {}): TransactionView[] {
  const method = opts.method ?? 'accrual';
  const entries = listJournalEntries(opts);
  const out: TransactionView[] = [];
  const expenseCodes = new Set(expenseAccounts().map(a => a.code));

  for (const e of entries) {
    // Find the expense-side line(s). For a typical expense entry there's one.
    const expenseLines = e.lines.filter(l => expenseCodes.has(l.account) && l.debitCents > 0);
    for (const line of expenseLines) {
      const acct = accountByCode(line.account);
      const refDate = method === 'cash' ? e.cashDate : e.serviceDate;
      out.push({
        id: `${e.id}-${line.account}`,
        journalId: e.id,
        date: refDate ?? e.serviceDate,
        account: line.account,
        accountName: acct?.name ?? accountName(line.account),
        vendor: e.vendor ?? '—',
        channel: e.channel,
        memo: line.memo ?? e.memo,
        amountCents: line.debitCents,
        deductible: !!acct?.scheduleC,
        reconciliation: e.reconciliation.state,
        hasReceipt: e.attachments.length > 0,
        superseded: !!e.supersededBy,
        createdBy: e.createdBy,
        createdAt: e.createdAt,
      });
    }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

export type NewExpenseInput = {
  serviceDate: string;
  cashDate: string | null;
  vendor: string;
  memo: string;
  accountCode: string;
  amountCents: number;
  channel?: JournalEntry['channel'];
  hasReceipt?: boolean;
};

export function postExpense(input: NewExpenseInput): JournalEntry {
  validate(input);
  assertPeriodOpen(input.serviceDate);
  const e = expenseEntry({ ...input });
  JOURNAL = [e, ...JOURNAL];
  logAudit({
    kind: 'post',
    entryId: e.id,
    summary: `Posted expense ${e.vendor} ${formatAmount(input.amountCents)} → ${input.accountCode}`,
  });
  bump();
  return e;
}

/** Post a correcting entry that supersedes an existing one. */
export function correctExpense(args: {
  originalId: string;
  reason: string;
  next: NewExpenseInput;
}): JournalEntry {
  const original = JOURNAL.find(e => e.id === args.originalId);
  if (!original) throw new Error(`Journal entry ${args.originalId} not found`);
  if (original.supersededBy) throw new Error(`Journal entry ${args.originalId} is already superseded`);
  validate(args.next);
  assertPeriodOpen(original.serviceDate);
  assertPeriodOpen(args.next.serviceDate);
  const correction = expenseEntry(args.next);
  correction.supersedes = original.id;
  correction.correctionReason = args.reason;
  // Mark original as superseded — this is the ONLY mutation; the lines/values themselves are untouched.
  JOURNAL = JOURNAL.map(e =>
    e.id === original.id ? { ...e, supersededBy: correction.id } : e,
  );
  JOURNAL = [correction, ...JOURNAL];
  logAudit({
    kind: 'correct',
    entryId: correction.id,
    relatedId: original.id,
    reason: args.reason,
    summary: `Corrected ${original.vendor} entry (was ${formatAmount(sumDebits(original))} → ${formatAmount(args.next.amountCents)})`,
  });
  bump();
  return correction;
}

export function updateReconciliation(journalId: string, next: ReconciliationStatus): JournalEntry {
  let updated: JournalEntry | undefined;
  let prev: ReconciliationStatus['state'] | undefined;
  JOURNAL = JOURNAL.map(e => {
    if (e.id !== journalId) return e;
    prev = e.reconciliation.state;
    updated = { ...e, reconciliation: next };
    return updated;
  });
  if (!updated) throw new Error(`Journal entry ${journalId} not found`);
  logAudit({
    kind: 'reconcile',
    entryId: journalId,
    summary: `Reconciliation: ${prev} → ${next.state}`,
  });
  bump();
  return updated;
}

// Aggregates ─────────────────────────────────────────────────────────────────

export type TotalsByAccount = Map<string, { code: string; name: string; cents: number; scheduleC?: string }>;

export function totalsByAccount(opts: ListOpts = {}): TotalsByAccount {
  const totals: TotalsByAccount = new Map();
  for (const t of listTransactions(opts)) {
    const cur = totals.get(t.account) ?? { code: t.account, name: t.accountName, cents: 0, scheduleC: accountByCode(t.account)?.scheduleC };
    cur.cents += t.amountCents;
    totals.set(t.account, cur);
  }
  return totals;
}

export function totalCents(opts: ListOpts = {}): number {
  let sum = 0;
  for (const t of listTransactions(opts)) sum += t.amountCents;
  return sum;
}

// ─────────────────────────────────────────────────────────────────────────────
// Revenue projections — same shape as listTransactions but credit side of
// revenue accounts. Used by TaxReport.
// ─────────────────────────────────────────────────────────────────────────────

export function listRevenue(opts: Omit<ListOpts, 'accounts'> = {}): TransactionView[] {
  const method = opts.method ?? 'accrual';
  const entries = listJournalEntries(opts);
  const out: TransactionView[] = [];

  for (const e of entries) {
    // Revenue lines = credit side of 4xxx accounts.
    const revLines = e.lines.filter(l => l.account.startsWith('4') && l.creditCents > 0);
    for (const line of revLines) {
      const acct = accountByCode(line.account);
      const refDate = method === 'cash' ? e.cashDate : e.serviceDate;
      out.push({
        id: `${e.id}-${line.account}-rev`,
        journalId: e.id,
        date: refDate ?? e.serviceDate,
        account: line.account,
        accountName: acct?.name ?? accountName(line.account),
        vendor: e.vendor ?? '—',
        channel: e.channel,
        memo: line.memo ?? e.memo,
        amountCents: line.creditCents,
        deductible: false,
        reconciliation: e.reconciliation.state,
        hasReceipt: e.attachments.length > 0,
        superseded: !!e.supersededBy,
        createdBy: e.createdBy,
        createdAt: e.createdAt,
      });
    }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

export function revenueTotalCents(opts: Omit<ListOpts, 'accounts'> = {}): number {
  return listRevenue(opts).reduce((s, r) => s + r.amountCents, 0);
}

/**
 * Monthly income vs expense buckets for the TaxReport bar chart.
 * Returns one entry per month in the period, sorted ascending.
 */
export function monthlyCashFlow(opts: ListOpts = {}): Array<{ month: string; income: number; expense: number }> {
  const buckets = new Map<string, { income: number; expense: number }>();
  for (const r of listRevenue(opts)) {
    const m = r.date.slice(0, 7);
    const b = buckets.get(m) ?? { income: 0, expense: 0 };
    b.income += r.amountCents;
    buckets.set(m, b);
  }
  for (const t of listTransactions(opts)) {
    const m = t.date.slice(0, 7);
    const b = buckets.get(m) ?? { income: 0, expense: 0 };
    b.expense += t.amountCents;
    buckets.set(m, b);
  }
  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => ({ month, income: v.income, expense: v.expense }));
}

// Vendors ────────────────────────────────────────────────────────────────────

export function listVendors(opts: ListOpts = {}): Array<{ name: string; totalCents: number; lastDate: string; categoryCode: string }> {
  const map = new Map<string, { name: string; totalCents: number; lastDate: string; categoryCode: string }>();
  for (const t of listTransactions(opts)) {
    const cur = map.get(t.vendor);
    if (!cur) {
      map.set(t.vendor, { name: t.vendor, totalCents: t.amountCents, lastDate: t.date, categoryCode: t.account });
    } else {
      cur.totalCents += t.amountCents;
      if (t.date > cur.lastDate) { cur.lastDate = t.date; cur.categoryCode = t.account; }
    }
  }
  return Array.from(map.values()).sort((a, b) => b.totalCents - a.totalCents);
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation — minimal but real. Balance-check is the most important.
// ─────────────────────────────────────────────────────────────────────────────

function validate(input: NewExpenseInput): void {
  if (!input.vendor?.trim()) throw new Error('Vendor is required');
  if (!input.accountCode || !accountByCode(input.accountCode)) throw new Error('Invalid GL account');
  if (!Number.isFinite(input.amountCents) || input.amountCents <= 0) throw new Error('Amount must be greater than zero');
  if (!input.serviceDate) throw new Error('Service date is required');
}

/** Returns true if the entry balances (sum of debits === sum of credits). */
export function isBalanced(entry: JournalEntry): boolean {
  const debit  = entry.lines.reduce((s, l) => s + l.debitCents,  0);
  const credit = entry.lines.reduce((s, l) => s + l.creditCents, 0);
  return debit === credit;
}

function sumDebits(entry: JournalEntry): number {
  return entry.lines.reduce((s, l) => s + l.debitCents, 0);
}

function formatAmount(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Audit log — one feed, every mutation appends. Read by the AuditLog page.
// ─────────────────────────────────────────────────────────────────────────────

export type AuditEntry = {
  id: string;
  at: string; // ISO timestamp
  actor: string;
  kind: 'post' | 'correct' | 'reconcile' | 'close-period' | 'reopen-period';
  /** Primary entry the audit row references. */
  entryId?: string;
  /** Related (superseded) entry id for corrections. */
  relatedId?: string;
  /** Reason given (corrections + closures). */
  reason?: string;
  summary: string;
};

let AUDIT: AuditEntry[] = [];

function logAudit(input: Omit<AuditEntry, 'id' | 'at' | 'actor'>) {
  AUDIT = [
    {
      id: `AUD-${Math.random().toString(36).slice(2, 9).toUpperCase()}`,
      at: new Date().toISOString(),
      actor: 'Kaden', // wire to auth in a later pass
      ...input,
    },
    ...AUDIT,
  ];
}

export function listAuditEntries(filter?: { entryId?: string; sinceDays?: number }): AuditEntry[] {
  const cutoff = filter?.sinceDays != null ? Date.now() - filter.sinceDays * 86_400_000 : 0;
  return AUDIT.filter(a => {
    if (filter?.entryId && a.entryId !== filter.entryId && a.relatedId !== filter.entryId) return false;
    if (cutoff && new Date(a.at).getTime() < cutoff) return false;
    return true;
  });
}

/** Walk the supersedes chain for a journal entry. Useful for activity feed. */
export function getEntryChain(entryId: string): JournalEntry[] {
  const chain: JournalEntry[] = [];
  let current = JOURNAL.find(e => e.id === entryId);
  while (current) {
    chain.push(current);
    if (!current.supersedes) break;
    current = JOURNAL.find(e => e.id === current!.supersedes);
  }
  return chain; // newest first
}

// ─────────────────────────────────────────────────────────────────────────────
// Period close / lock enforcement
// ─────────────────────────────────────────────────────────────────────────────

let PERIODS: FiscalPeriod[] = [];

export function listPeriods(): FiscalPeriod[] {
  return PERIODS;
}

/** Returns the closed/locked period containing `date`, or null if no closure applies. */
export function periodFor(date: string): FiscalPeriod | null {
  return PERIODS.find(p => date >= p.start && date <= p.end) ?? null;
}

function assertPeriodOpen(date: string): void {
  const period = periodFor(date);
  if (!period) return;
  if (period.status !== 'open') {
    throw new Error(`Period ${period.id} is ${period.status}. Reopen the period to post here.`);
  }
}

/**
 * Close a fiscal period. The period must not already exist (or must be open).
 * Closing forbids new posts; corrections can reopen and re-close.
 */
export function closePeriod(args: {
  kind: 'month' | 'quarter' | 'year';
  start: string;
  end: string;
  id: string;
}): FiscalPeriod {
  const existing = PERIODS.find(p => p.id === args.id);
  if (existing && existing.status !== 'open') {
    throw new Error(`Period ${args.id} is already ${existing.status}`);
  }
  const next: FiscalPeriod = {
    id: args.id,
    kind: args.kind,
    start: args.start,
    end: args.end,
    status: 'closed',
    closedAt: new Date().toISOString(),
    closedBy: 'Kaden',
  };
  PERIODS = existing
    ? PERIODS.map(p => (p.id === args.id ? next : p))
    : [...PERIODS, next];
  logAudit({ kind: 'close-period', summary: `Closed ${args.id}`, reason: 'period close' });
  bump();
  return next;
}

export function reopenPeriod(periodId: string, reason: string): FiscalPeriod {
  const existing = PERIODS.find(p => p.id === periodId);
  if (!existing) throw new Error(`Period ${periodId} not found`);
  if (existing.status === 'locked') throw new Error(`Period ${periodId} is locked and cannot be reopened from this UI`);
  const next: FiscalPeriod = { ...existing, status: 'open', closedAt: undefined, closedBy: undefined };
  PERIODS = PERIODS.map(p => (p.id === periodId ? next : p));
  logAudit({ kind: 'reopen-period', summary: `Reopened ${periodId}`, reason });
  bump();
  return next;
}
