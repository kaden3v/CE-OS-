import { fetchTransactions, plaidEnabled, type PlaidTransaction } from '../plaid/client.js';

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

export async function listBankLines(args: { startDate: string; endDate: string }): Promise<{ lines: BankLine[]; source: 'plaid' | 'mock' }> {
  if (!plaidEnabled() || !process.env.PLAID_ACCESS_TOKEN) {
    return { lines: filterMock(MOCK_LINES, args), source: 'mock' };
  }
  const { transactions } = await fetchTransactions({ startDate: args.startDate, endDate: args.endDate });
  return {
    lines: transactions.filter(t => !t.pending).map(normalize),
    source: 'plaid',
  };
}

function normalize(t: PlaidTransaction): BankLine {
  return {
    id: t.transaction_id,
    date: t.date,
    amountCents: Math.round(Math.abs(t.amount) * 100),
    description: t.merchant_name ?? t.name,
  };
}

function filterMock(lines: BankLine[], args: { startDate: string; endDate: string }): BankLine[] {
  return lines.filter(l => l.date >= args.startDate && l.date <= args.endDate);
}
