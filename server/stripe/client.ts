/**
 * Stripe REST client (no SDK — fetch only).
 *
 * Setup:
 *   1. Get a restricted key at https://dashboard.stripe.com/apikeys
 *      with read access to: balance, balance_transactions, payouts, charges.
 *   2. Set in .env:  STRIPE_SECRET_KEY=rk_live_...   (or rk_test_... for test)
 *   3. Restart the server.
 *
 * If STRIPE_SECRET_KEY is not set, every endpoint returns mock data so the
 * UI keeps working.
 */

export type StripePayout = {
  id: string;
  amount: number;            // cents
  currency: string;
  arrival_date: number;      // unix seconds
  status: string;
  description: string | null;
  source_type: string;
};

export type StripeBalanceTransaction = {
  id: string;
  amount: number;
  currency: string;
  available_on: number;
  created: number;
  type: string;
  description: string | null;
  source: string | null;
  net: number;
  fee: number;
};

export function stripeEnabled(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

async function stripeGet<T>(path: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
  if (!stripeEnabled()) throw new Error('Stripe is not configured');
  const qs = new URLSearchParams();
  for (const k in params) if (params[k] != null) qs.set(k, String(params[k]));
  const res = await fetch(`https://api.stripe.com${path}?${qs.toString()}`, {
    headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err: any = new Error(`Stripe responded ${res.status}: ${text}`);
    err.status = res.status; err.body = text;
    throw err;
  }
  return res.json() as Promise<T>;
}

export async function listPayouts(args: { since?: number; limit?: number }) {
  return stripeGet<{ data: StripePayout[]; has_more: boolean }>(
    '/v1/payouts',
    { 'created[gte]': args.since, limit: args.limit ?? 100 },
  );
}

export async function listBalanceTransactions(args: { since?: number; until?: number; limit?: number }) {
  return stripeGet<{ data: StripeBalanceTransaction[]; has_more: boolean }>(
    '/v1/balance_transactions',
    { 'created[gte]': args.since, 'created[lte]': args.until, limit: args.limit ?? 100 },
  );
}

/**
 * Sum of `amount` (gross) on charge balance-transactions in a period.
 * Used to populate "Reported (1099-K)" on the 1099-K worksheet.
 */
export async function grossChargesInRange(since: number, until: number): Promise<{ grossCents: number; count: number }> {
  const all: StripeBalanceTransaction[] = [];
  let lastUntil: number | undefined = until;
  // Stripe paginates; one fetch of 100 is enough for the seed scope.
  const { data } = await listBalanceTransactions({ since, until: lastUntil, limit: 100 });
  for (const t of data) if (t.type === 'charge') all.push(t);
  return {
    grossCents: all.reduce((s, t) => s + t.amount, 0),
    count: all.length,
  };
}
