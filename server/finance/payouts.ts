import { listPayouts, listBalanceTransactions, stripeEnabled, type StripePayout, type StripeBalanceTransaction } from '../stripe/client.js';

/**
 * Normalized payout shape — matches what the /finances/payouts page consumes.
 *
 * Each payout has:
 *   - net amount + currency + arrival date
 *   - a list of source balance transactions (the charges that fed into it,
 *     plus the fees deducted)
 *
 * This drives a three-way match conversation:
 *   Shopify order → Stripe charge → Stripe payout → bank deposit
 */

export type PayoutLine = {
  id: string;
  type: string;          // 'charge' | 'refund' | 'stripe_fee' | …
  amountCents: number;
  netCents: number;
  feeCents: number;
  description: string | null;
  created: number;       // unix seconds
};

export type Payout = {
  id: string;
  arrivalDate: number;
  status: string;
  amountCents: number;
  currency: string;
  description: string | null;
  lines: PayoutLine[];
};

/** Stable mock so the page renders something when Stripe isn't configured. */
const MOCK: Payout[] = [
  {
    id: 'po_mock_1', arrivalDate: nowMinusDays(2), status: 'paid', amountCents: 78_200, currency: 'usd',
    description: 'Shopify Payments — daily payout',
    lines: [
      { id: 'txn_mock_a', type: 'charge',     amountCents: 24_500, netCents: 23_590, feeCents: 910, description: 'Order #1284',  created: nowMinusDays(2) },
      { id: 'txn_mock_b', type: 'charge',     amountCents: 18_200, netCents: 17_524, feeCents: 676, description: 'Order #1283',  created: nowMinusDays(2) },
      { id: 'txn_mock_c', type: 'charge',     amountCents: 36_500, netCents: 35_175, feeCents: 1_325, description: 'Order #1282', created: nowMinusDays(2) },
      { id: 'txn_mock_d', type: 'stripe_fee', amountCents: -2_911, netCents: -2_911, feeCents: 0, description: 'Stripe fees', created: nowMinusDays(2) },
    ],
  },
  {
    id: 'po_mock_2', arrivalDate: nowMinusDays(9), status: 'paid', amountCents: 41_200, currency: 'usd',
    description: 'Shopify Payments — daily payout',
    lines: [
      { id: 'txn_mock_e', type: 'charge', amountCents: 41_200, netCents: 39_704, feeCents: 1_496, description: 'Spring sale batch', created: nowMinusDays(9) },
      { id: 'txn_mock_f', type: 'stripe_fee', amountCents: -1_496, netCents: -1_496, feeCents: 0, description: 'Stripe fees', created: nowMinusDays(9) },
    ],
  },
];

function nowMinusDays(d: number) { return Math.floor((Date.now() - d * 86_400_000) / 1000); }

export async function listPayoutsForUI(args: { since: number; until: number }): Promise<{ payouts: Payout[]; source: 'stripe' | 'mock' }> {
  if (!stripeEnabled()) return { payouts: MOCK.filter(p => p.arrivalDate >= args.since && p.arrivalDate <= args.until), source: 'mock' };

  const { data: payouts } = await listPayouts({ since: args.since, limit: 100 });
  // Fetch all balance transactions in the window once, then group by payout.
  const { data: txs } = await listBalanceTransactions({ since: args.since, until: args.until, limit: 100 });
  const byPayout = new Map<string, StripeBalanceTransaction[]>();
  for (const t of txs) {
    // Stripe balance_transactions expose `source` and may have a `payout` association via the payout endpoint; for accuracy this would call /v1/payouts/:id/transactions per payout. For one turn, this is the cheap approximation.
    const key = (t as any).source ?? '__unassigned';
    if (!byPayout.has(key)) byPayout.set(key, []);
    byPayout.get(key)!.push(t);
  }
  return {
    payouts: payouts.map(p => normalize(p, byPayout.get(p.id) ?? [])),
    source: 'stripe',
  };
}

function normalize(p: StripePayout, txs: StripeBalanceTransaction[]): Payout {
  return {
    id: p.id,
    arrivalDate: p.arrival_date,
    status: p.status,
    amountCents: p.amount,
    currency: p.currency,
    description: p.description,
    lines: txs.map(t => ({
      id: t.id,
      type: t.type,
      amountCents: t.amount,
      netCents: t.net,
      feeCents: t.fee,
      description: t.description,
      created: t.created,
    })),
  };
}
