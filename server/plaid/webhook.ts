/**
 * Plaid webhook handler.
 *
 * Plaid pushes events to a URL you register in the dashboard. The handler:
 *   1. Verifies the request signature (HMAC-SHA256 over the raw body with
 *      PLAID_WEBHOOK_SECRET as the key). For production, Plaid also supports
 *      JWT signing via their JWKS endpoint — see the comment below.
 *   2. Dispatches on `webhook_type` × `webhook_code`.
 *   3. For TRANSACTIONS events, pulls the new/modified transactions and
 *      writes them into the bank-feed cache. The ReconcileModal then sees
 *      them without an additional Plaid pull.
 *
 * Setup:
 *   1. In Plaid dashboard, register your public webhook URL (use ngrok in
 *      dev: `ngrok http 8787`, then point the dashboard at
 *      `https://<ngrok>.ngrok.io/api/finance/plaid/webhook`).
 *   2. Set `PLAID_WEBHOOK_SECRET` in .env to a random 32-byte string and
 *      paste the same value into the Plaid dashboard's signing secret field.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';
import { fetchTransactions } from './client.js';
import { ingestBankLinesFromWebhook } from '../finance/bankFeed.js';

export async function plaidWebhookHandler(req: Request, res: Response) {
  // Body is raw (Buffer) — required for signature verification.
  const rawBody = req.body as Buffer;
  if (!Buffer.isBuffer(rawBody)) {
    return res.status(400).json({ error: 'Expected raw body — register the route with express.raw().' });
  }

  const secret = process.env.PLAID_WEBHOOK_SECRET;
  if (secret) {
    const provided = req.headers['plaid-verification'] || req.headers['x-plaid-signature'];
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    if (typeof provided !== 'string' || !equalConstantTime(provided, expected)) {
      return res.status(401).json({ error: 'Invalid Plaid signature' });
    }
  }
  // If no secret is configured, accept (dev-only; production should refuse).
  // For full JWT-based verification, fetch https://production.plaid.com/webhook_verification_key/get
  // and validate the JWT in Plaid-Verification. That's worth doing before
  // production but adds another network hop and a JWKS cache layer.

  const body = JSON.parse(rawBody.toString('utf8'));

  if (body.webhook_type === 'TRANSACTIONS') {
    // Pull recent transactions and merge into cache. Plaid's webhook tells us
    // *that* something changed; we still call /transactions/get to fetch it.
    const today = new Date(); const past = new Date(); past.setDate(today.getDate() - 30);
    try {
      const { transactions } = await fetchTransactions({
        startDate: past.toISOString().split('T')[0],
        endDate: today.toISOString().split('T')[0],
      });
      ingestBankLinesFromWebhook(transactions);
      console.log(`[plaid.webhook] ingested ${transactions.length} transactions (${body.webhook_code})`);
    } catch (err) {
      console.error('[plaid.webhook] ingest failed', err);
    }
  } else {
    console.log(`[plaid.webhook] ignoring ${body.webhook_type}/${body.webhook_code}`);
  }

  res.json({ ok: true });
}

function equalConstantTime(a: string, b: string): boolean {
  const ab = Buffer.from(a); const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
