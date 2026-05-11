/**
 * Typed fetch client for the CE OS backend.
 *
 * Every page that needs server data goes through here, never `fetch()` directly.
 * That way the shape of an error path is consistent and we have one place to
 * add auth headers / tracing / retry later.
 */

import type { OrderRecord } from '@/components/record/configs/order';

export type ApiError = { error: string; detail?: unknown };
export class ApiFetchError extends Error {
  status: number;
  detail: unknown;
  constructor(status: number, message: string, detail?: unknown) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

async function getJSON<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { Accept: 'application/json', ...(init?.headers ?? {}) } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = body as ApiError;
    throw new ApiFetchError(res.status, err.error ?? `Request failed (${res.status})`, err.detail);
  }
  return body as T;
}

// ── Orders ──────────────────────────────────────────────────────────────────
export type OrdersResponse = {
  orders: OrderRecord[];
  nextCursor: string | null;
};

export function fetchOrders(params: { limit?: number; cursor?: string | null } = {}): Promise<OrdersResponse> {
  const q = new URLSearchParams();
  if (params.limit) q.set('limit', String(params.limit));
  if (params.cursor) q.set('cursor', params.cursor);
  const suffix = q.toString() ? `?${q}` : '';
  return getJSON<OrdersResponse>(`/api/orders${suffix}`);
}

// ── Health ──────────────────────────────────────────────────────────────────
export type HealthResponse = {
  ok: boolean;
  shop: string | null;
  tokenConfigured: boolean;
  apiVersion: string;
  plaidConfigured: boolean;
  stripeConfigured: boolean;
};

export function fetchHealth(): Promise<HealthResponse> {
  return getJSON<HealthResponse>('/api/health');
}

// ── Finance: bank feed (Plaid) ──────────────────────────────────────────────
export type BankLine = {
  id: string;
  date: string;
  amountCents: number;
  description: string;
};

export function fetchBankFeed(params: { start: string; end: string }): Promise<{ lines: BankLine[]; source: 'plaid' | 'mock' }> {
  const q = new URLSearchParams({ start: params.start, end: params.end });
  return getJSON(`/api/finance/bank-feed?${q}`);
}

// ── Finance: processor gross (1099-K Sync) ─────────────────────────────────
export type ProcessorGrossResponse = {
  grossCents: number;
  count?: number;
  source: 'shopify' | 'stripe' | 'unavailable';
  note?: string;
};

export function fetchProcessorGross(params: { channel: 'Shopify' | 'Stripe' | 'Etsy'; start: string; end: string }): Promise<ProcessorGrossResponse> {
  const q = new URLSearchParams({ channel: params.channel, start: params.start, end: params.end });
  return getJSON(`/api/finance/processor-gross?${q}`);
}

// ── Finance: receipts upload ────────────────────────────────────────────────
export type ReceiptUpload = {
  url: string;
  filename: string;
  bytes: number;
  mimeType: string;
  journalId: string;
};

export async function uploadReceipt(args: { journalId: string; file: File }): Promise<ReceiptUpload> {
  const res = await fetch(`/api/finance/receipts?journalId=${encodeURIComponent(args.journalId)}`, {
    method: 'POST',
    headers: {
      'Content-Type': args.file.type || 'application/octet-stream',
      'X-Original-Filename': args.file.name,
    },
    body: await args.file.arrayBuffer(),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiFetchError(res.status, body.error ?? 'Upload failed', body);
  return body as ReceiptUpload;
}

// ── Finance: receipt OCR ────────────────────────────────────────────────────
export type OcrResult = {
  vendor: string | null;
  amountCents: number | null;
  date: string | null;
  confidence: number | null;
  notes: string | null;
  rawText: string;
};

export async function ocrReceiptFile(file: File): Promise<OcrResult> {
  const res = await fetch('/api/finance/receipts/ocr-only', {
    method: 'POST',
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    body: await file.arrayBuffer(),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiFetchError(res.status, body.error ?? 'OCR failed', body);
  return body as OcrResult;
}

export async function ocrUploadedReceipt(args: { journalId: string; filename: string }): Promise<OcrResult> {
  return getJSON<OcrResult>('/api/finance/receipts/ocr', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
}

// ── Finance: Stripe payouts ─────────────────────────────────────────────────
export type PayoutLine = {
  id: string;
  type: string;
  amountCents: number;
  netCents: number;
  feeCents: number;
  description: string | null;
  created: number;
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

export function fetchPayouts(params: { start: string; end: string }): Promise<{ payouts: Payout[]; source: 'stripe' | 'mock' }> {
  const q = new URLSearchParams({ start: params.start, end: params.end });
  return getJSON(`/api/finance/payouts?${q}`);
}
