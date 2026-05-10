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
};

export function fetchHealth(): Promise<HealthResponse> {
  return getJSON<HealthResponse>('/api/health');
}
