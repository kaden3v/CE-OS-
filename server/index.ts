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
