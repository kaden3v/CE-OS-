/**
 * CE OS backend — first slice.
 *
 * Single responsibility for now: hold the Shopify admin token and expose
 * read-only endpoints the React app can fetch. No DB, no webhooks yet — that
 * comes in the next slice once we feel the latency.
 *
 * Run:    npm run dev:server
 * Health: curl http://localhost:8787/api/health
 */

import express, { type Request, type Response } from 'express';
import dotenv from 'dotenv';
import { listOrders } from './shopify/orders.js';
import { grossSales } from './shopify/sales.js';
import { listBankLines } from './finance/bankFeed.js';
import { storeReceipt, RECEIPTS_ROOT, ocrReceipt, ocrImage } from './finance/receipts.js';
import { createLinkToken, exchangePublicToken, plaidEnabled } from './plaid/client.js';
import { grossChargesInRange, stripeEnabled } from './stripe/client.js';
import { listPayoutsForUI } from './finance/payouts.js';
import { plaidWebhookHandler } from './plaid/webhook.js';

dotenv.config();

const PORT = Number(process.env.API_PORT ?? 8787);
const app = express();
app.use(express.json());

// ── Health ──────────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  const shop = process.env.SHOPIFY_SHOP_DOMAIN;
  const tokenOk = !!process.env.SHOPIFY_ADMIN_TOKEN?.startsWith('shpat_');
  res.json({
    ok: true,
    shop: shop ?? null,
    tokenConfigured: tokenOk,
    apiVersion: process.env.SHOPIFY_API_VERSION ?? '2025-01',
    plaidConfigured: plaidEnabled() && !!process.env.PLAID_ACCESS_TOKEN,
    stripeConfigured: stripeEnabled(),
  });
});

// ── Orders ──────────────────────────────────────────────────────────────────
app.get('/api/orders', async (req: Request, res: Response) => {
  try {
    const limit = clamp(Number(req.query.limit ?? 50), 1, 250);
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : null;
    const data = await listOrders({ limit, cursor });
    res.json(data);
  } catch (err) {
    handleErr(res, err);
  }
});

// ── Bank feed (Plaid; falls back to mock when not configured) ──────────────
app.get('/api/finance/bank-feed', async (req: Request, res: Response) => {
  try {
    const startDate = String(req.query.start ?? '');
    const endDate   = String(req.query.end ?? '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return res.status(400).json({ error: 'start and end (YYYY-MM-DD) required' });
    }
    const data = await listBankLines({ startDate, endDate });
    res.json(data);
  } catch (err) { handleErr(res, err); }
});

// ── Plaid Link flow ────────────────────────────────────────────────────────
app.post('/api/finance/plaid/link-token', async (_req: Request, res: Response) => {
  try {
    if (!plaidEnabled()) return res.status(503).json({ error: 'Plaid not configured. Set PLAID_CLIENT_ID and PLAID_SECRET in .env.' });
    const data = await createLinkToken('canyon-exotics-os');
    res.json(data);
  } catch (err) { handleErr(res, err); }
});

app.post('/api/finance/plaid/exchange', async (req: Request, res: Response) => {
  try {
    const publicToken = String(req.body?.public_token ?? '');
    if (!publicToken) return res.status(400).json({ error: 'public_token required' });
    const data = await exchangePublicToken(publicToken);
    // In production, persist data.access_token to a DB keyed by your user/org.
    // For dev we surface it so the operator can paste it into .env once.
    res.json({ ...data, note: 'Copy access_token into PLAID_ACCESS_TOKEN in .env and restart the server.' });
  } catch (err) { handleErr(res, err); }
});

// ── Processor gross totals (1099-K Sync) ───────────────────────────────────
app.get('/api/finance/processor-gross', async (req: Request, res: Response) => {
  try {
    const channel = String(req.query.channel ?? '');
    const startDate = String(req.query.start ?? '');
    const endDate   = String(req.query.end ?? '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return res.status(400).json({ error: 'start and end (YYYY-MM-DD) required' });
    }
    if (channel === 'Shopify') {
      if (!process.env.SHOPIFY_ADMIN_TOKEN) return res.json({ grossCents: 0, source: 'unavailable', note: 'SHOPIFY_ADMIN_TOKEN not set' });
      const { grossCents, count, hasMore } = await grossSales({ startDate, endDate });
      return res.json({ grossCents, count, hasMore, source: 'shopify' });
    }
    if (channel === 'Stripe') {
      if (!stripeEnabled()) return res.json({ grossCents: 0, source: 'unavailable', note: 'STRIPE_SECRET_KEY not set' });
      const since = Math.floor(new Date(startDate).getTime() / 1000);
      const until = Math.floor(new Date(endDate).getTime() / 1000) + 86399;
      const { grossCents, count } = await grossChargesInRange(since, until);
      return res.json({ grossCents, count, source: 'stripe' });
    }
    if (channel === 'Etsy') {
      // Etsy API requires OAuth approval per-shop and isn't trivial to wire
      // without operator-side setup. Pass 5 if needed.
      return res.json({ grossCents: 0, source: 'unavailable', note: 'Etsy auto-pull pending OAuth setup' });
    }
    return res.status(400).json({ error: `Unknown channel: ${channel}` });
  } catch (err) { handleErr(res, err); }
});

// ── Receipt upload + serve ─────────────────────────────────────────────────
import { raw } from 'express';
app.post('/api/finance/receipts', raw({ type: ['application/pdf', 'image/*'], limit: '10mb' }), async (req: Request, res: Response) => {
  try {
    const journalId = String(req.query.journalId ?? '');
    if (!journalId) return res.status(400).json({ error: 'journalId query param required' });
    const buffer = req.body as Buffer;
    if (!buffer?.length) return res.status(400).json({ error: 'No file body received' });
    const stored = await storeReceipt({
      journalId,
      mimeType: req.headers['content-type'] ?? 'application/octet-stream',
      buffer,
      originalName: typeof req.headers['x-original-filename'] === 'string' ? req.headers['x-original-filename'] : undefined,
    });
    res.json(stored);
  } catch (err) { handleErr(res, err); }
});

app.use('/api/finance/receipts', express.static(RECEIPTS_ROOT));

// OCR — extract vendor/amount/date from an already-uploaded receipt.
app.post('/api/finance/receipts/ocr', express.json(), async (req: Request, res: Response) => {
  try {
    const journalId = String(req.body?.journalId ?? '');
    const filename  = String(req.body?.filename ?? '');
    if (!journalId || !filename) return res.status(400).json({ error: 'journalId and filename required' });
    const result = await ocrReceipt({ journalId, filename });
    res.json(result);
  } catch (err) { handleErr(res, err); }
});

// OCR — extract directly from a raw image body (no storage). For the
// New Expense modal: drop an image, get fields pre-filled.
app.post('/api/finance/receipts/ocr-only', raw({ type: ['application/pdf', 'image/*'], limit: '10mb' }), async (req: Request, res: Response) => {
  try {
    const buffer = req.body as Buffer;
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) return res.status(400).json({ error: 'No file body received' });
    const mimeType = req.headers['content-type'] ?? 'application/octet-stream';
    const result = await ocrImage(buffer, mimeType);
    res.json(result);
  } catch (err) { handleErr(res, err); }
});

// ── Stripe payouts ─────────────────────────────────────────────────────────
app.get('/api/finance/payouts', async (req: Request, res: Response) => {
  try {
    const start = String(req.query.start ?? '');
    const end   = String(req.query.end ?? '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
      return res.status(400).json({ error: 'start and end (YYYY-MM-DD) required' });
    }
    const since = Math.floor(new Date(start).getTime() / 1000);
    const until = Math.floor(new Date(end).getTime() / 1000) + 86399;
    const data = await listPayoutsForUI({ since, until });
    res.json(data);
  } catch (err) { handleErr(res, err); }
});

// ── Plaid webhook ──────────────────────────────────────────────────────────
app.post('/api/finance/plaid/webhook', raw({ type: 'application/json', limit: '1mb' }), plaidWebhookHandler);

// ── Error helper ────────────────────────────────────────────────────────────
function handleErr(res: Response, err: unknown) {
  const e = err as { status?: number; message?: string; body?: unknown };
  const status = e?.status ?? 500;
  console.error('[api]', e?.message ?? e);
  res.status(status).json({
    error: e?.message ?? 'Unknown server error',
    detail: e?.body ?? null,
  });
}

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : lo));
}

// ── Start ───────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[api] listening on http://localhost:${PORT}`);
  if (!process.env.SHOPIFY_ADMIN_TOKEN) {
    console.warn('[api] SHOPIFY_ADMIN_TOKEN is not set — /api/orders will fail until you configure .env');
  }
});
