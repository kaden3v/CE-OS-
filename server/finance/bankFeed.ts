import { fetchTransactions, plaidEnabled, type PlaidTransaction } from '../plaid/client.js';
import { readCache, writeCache } from './cache.js';

/**
 * Normalized bank-line shape consumed by the ReconcileModal.
 * Keep this in sync with `BankLine` on the client.
 */
export type BankLine = {
  id: string;
  date: string;
  amountCents: number;
  description: string;
};

const CACHE_KEY = 'bank-feed';

/**
 * Stable mock used when Plaid isn't configured, so the rest of the app works.
 * In production this branch should never run.
 */
const MOCK_LINES: BankLine[] = [
  { id: 'bank-2025-05-08', date: '2025-05-08', amountCents: 14_500, description: 'POS SPHAGNUM MOSS CO' },
  { id: 'bank-2025-05-05', date: '2025-05-05', amountCents:  4_850, description: 'AMAZON BUSINESS' },
  { id: 'bank-2025-05-03', date: '2025-05-03', amountCents: 31_240, description: 'USPS.COM CLICK-N-SHIP' },
  { id: 'bank-2025-04-22', date: '2025-04-22', amountCents: 18_520, description: 'SRP ELECTRIC PMT' },
  { id: 'bank-2025-04-10', date: '2025-04-10', amountCents: 15_000, description: 'AZ DEPT AGRICULTURE' },
  { id: 'bank-2025-04-01', date: '2025-04-01', amountCents:  3_900, description: 'SHOPIFY MONTHLY' },
  { id: 'bank-2025-02-15', date: '2025-02-15', amountCents: 75_000, description: 'MILLER ACCT' },
];

export async function listBankLines(args: { startDate: string; endDate: string }): Promise<{ lines: BankLine[]; source: 'plaid' | 'cache' | 'mock' }> {
  if (!plaidEnabled() || !process.env.PLAID_ACCESS_TOKEN) {
    return { lines: filterRange(MOCK_LINES, args), source: 'mock' };
  }
  // Prefer the webhook-populated cache if it has lines covering the range.
  const cached = readCache<BankLine[]>(CACHE_KEY, []);
  if (cached.length) {
    const ranged = filterRange(cached, args);
    if (ranged.length) return { lines: ranged, source: 'cache' };
  }
  const { transactions } = await fetchTransactions({ startDate: args.startDate, endDate: args.endDate });
  const lines = transactions.filter(t => !t.pending).map(normalize);
  // Merge into cache (de-duplicate by id, retain everything we've ever seen).
  mergeIntoCache(lines);
  return { lines, source: 'plaid' };
}

/** Called by the Plaid webhook when transactions arrive. */
export function ingestBankLinesFromWebhook(plaidTxs: PlaidTransaction[]): void {
  const next = plaidTxs.filter(t => !t.pending).map(normalize);
  mergeIntoCache(next);
}

function mergeIntoCache(lines: BankLine[]): void {
  const cached = readCache<BankLine[]>(CACHE_KEY, []);
  const seen = new Map(cached.map(l => [l.id, l]));
  for (const l of lines) seen.set(l.id, l);
  writeCache(CACHE_KEY, Array.from(seen.values()).sort((a, b) => b.date.localeCompare(a.date)));
}

function normalize(t: PlaidTransaction): BankLine {
  return {
    id: t.transaction_id,
    date: t.date,
    amountCents: Math.round(Math.abs(t.amount) * 100),
    description: t.merchant_name ?? t.name,
  };
}

function filterRange(lines: BankLine[], args: { startDate: string; endDate: string }): BankLine[] {
  return lines.filter(l => l.date >= args.startDate && l.date <= args.endDate);
}
