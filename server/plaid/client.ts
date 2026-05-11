/**
 * Plaid REST client (no SDK — fetch only).
 *
 * Setup:
 *   1. Sign up at https://dashboard.plaid.com/signup
 *   2. Create an app, grab `client_id` and `secret` from Sandbox tab.
 *   3. Set in .env:
 *        PLAID_CLIENT_ID=...
 *        PLAID_SECRET=...
 *        PLAID_ENV=sandbox       (sandbox | development | production)
 *        PLAID_ACCESS_TOKEN=...  (after first successful exchange; or persist
 *                                in a DB once you have one)
 *   4. Restart `npm run dev:server`. The /api/finance/bank-feed endpoint
 *      switches from mock to live automatically.
 *
 * If PLAID_CLIENT_ID is not set, the bank-feed endpoint returns a stable
 * mock so the rest of the app keeps working.
 */

export type PlaidEnv = 'sandbox' | 'development' | 'production';

export type PlaidTransaction = {
  transaction_id: string;
  date: string;          // YYYY-MM-DD
  amount: number;        // dollars (positive = outflow, like a charge)
  iso_currency_code: string | null;
  merchant_name: string | null;
  name: string;
  pending: boolean;
};

export class PlaidError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export function plaidEnabled(): boolean {
  return !!process.env.PLAID_CLIENT_ID && !!process.env.PLAID_SECRET;
}

function baseUrl(): string {
  const env = (process.env.PLAID_ENV as PlaidEnv) ?? 'sandbox';
  switch (env) {
    case 'production':  return 'https://production.plaid.com';
    case 'development': return 'https://development.plaid.com';
    case 'sandbox':
    default:            return 'https://sandbox.plaid.com';
  }
}

async function plaidPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
  if (!plaidEnabled()) throw new PlaidError(500, 'Plaid is not configured');
  const res = await fetch(`${baseUrl()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.PLAID_CLIENT_ID,
      secret: process.env.PLAID_SECRET,
      ...body,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new PlaidError(res.status, `Plaid responded ${res.status}`, text);
  }
  return res.json() as Promise<T>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Endpoints used by the app
// ─────────────────────────────────────────────────────────────────────────────

/** Step 1 of Plaid Link — get a link_token to hand to the browser. */
export async function createLinkToken(userId: string) {
  return plaidPost<{ link_token: string; expiration: string }>('/link/token/create', {
    user: { client_user_id: userId },
    client_name: 'Canyon Exotics OS',
    products: ['transactions'],
    country_codes: ['US'],
    language: 'en',
  });
}

/** Step 2 — exchange the public_token from Link for a persistent access_token. */
export async function exchangePublicToken(publicToken: string) {
  return plaidPost<{ access_token: string; item_id: string }>('/item/public_token/exchange', {
    public_token: publicToken,
  });
}

/** Fetch transactions over a date range. */
export async function fetchTransactions(args: { startDate: string; endDate: string; count?: number }) {
  const accessToken = process.env.PLAID_ACCESS_TOKEN;
  if (!accessToken) throw new PlaidError(400, 'PLAID_ACCESS_TOKEN not set. Run /api/finance/plaid/exchange after a Link flow.');
  return plaidPost<{ transactions: PlaidTransaction[]; total_transactions: number }>('/transactions/get', {
    access_token: accessToken,
    start_date: args.startDate,
    end_date: args.endDate,
    options: { count: args.count ?? 100 },
  });
}
