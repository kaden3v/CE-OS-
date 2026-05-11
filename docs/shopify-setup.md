# Shopify connection — first slice

Read-only pull of orders from Shopify into CE OS. No DB, no webhooks yet — those come next once you've felt the latency.

## 1. Create the Shopify custom app (one time)

1. In Shopify admin → **Settings** → **Apps and sales channels** → **Develop apps**. If you haven't used this before, click **Allow custom app development** on the introduction screen.
2. **Create an app** → name it `Canyon Exotics OS`.
3. **Configuration** tab → **Admin API integration** → **Configure**. Grant these scopes (read-only for now):
   - `read_orders`
   - `read_products`
   - `read_customers`
   - `read_inventory`
4. **Install app** on your store.
5. **API credentials** tab → copy the **Admin API access token**. It starts with `shpat_`. Save it now — Shopify only shows it once.

## 2. Configure CE OS

Create `.env` at the repo root (copy from `.env.example`):

```env
SHOPIFY_SHOP_DOMAIN="canyon-exotics.myshopify.com"   # your *.myshopify.com subdomain, not the custom domain
SHOPIFY_ADMIN_TOKEN="shpat_..."                       # the token you just copied
SHOPIFY_API_VERSION="2025-01"
API_PORT="8787"
```

The token never leaves the server. The browser only sees `/api/orders`.

## 3. Run

Two terminals (recommended — clearer logs):

```sh
npm run dev:server   # → http://localhost:8787
npm run dev          # → http://localhost:3000
```

Or one shell:

```sh
npm run dev:all
```

Sanity check the backend:

```sh
curl http://localhost:8787/api/health
# { "ok": true, "shop": "canyon-exotics.myshopify.com", "tokenConfigured": true, "apiVersion": "2025-01" }

curl http://localhost:8787/api/orders | jq '.orders | length'
# 50
```

Open the app at `http://localhost:3000/orders` — it now lists your real Shopify orders.

## What's wired

| Piece | Where |
| ----- | ----- |
| Token storage | `.env` (gitignored) |
| Shopify GraphQL client | [server/shopify/client.ts](../server/shopify/client.ts) |
| Orders query + normalizer | [server/shopify/orders.ts](../server/shopify/orders.ts) |
| Express routes | [server/index.ts](../server/index.ts) |
| Vite dev proxy `/api → :8787` | [vite.config.ts](../vite.config.ts) |
| Browser-side typed client | [src/lib/api.ts](../src/lib/api.ts) |
| Page hook (loading / error / empty / refetch) | [src/hooks/useApiData.ts](../src/hooks/useApiData.ts) |
| Orders page consuming it | [src/pages/Orders.tsx](../src/pages/Orders.tsx) |

## Status mapping

Shopify's order state is a triple (`displayFulfillmentStatus` × `displayFinancialStatus` × `cancelledAt`). The flat statuses used by CE OS (Pending / Processing / Packed / Shipped / Delivered / Cancelled) are derived in [server/shopify/orders.ts](../server/shopify/orders.ts) by `deriveStatus()`. The current mapping:

| Shopify | CE OS |
| ------- | ----- |
| `cancelledAt` set | Cancelled |
| `FULFILLED` | Delivered *(coarse — refine once tracking webhooks land)* |
| `PARTIALLY_FULFILLED` | Packed |
| `IN_PROGRESS` | Processing |
| `ON_HOLD`, `SCHEDULED` | Pending |
| `UNFULFILLED` + `PAID` | Processing |
| `UNFULFILLED` + unpaid | Pending |

Edit `deriveStatus()` if your operations think about state differently — that's the one place it's defined.

## Rate limits

Shopify Admin GraphQL is cost-based: 1000 points/sec, queries cost ~10–50 each. With the on-demand pattern (no DB), every page load consumes from your budget. The client logs cost when not in production:

```
[shopify] cost=14/14 avail=986/1000
```

Watch this. If `avail` regularly drops below 500, the next slice (DB + webhooks) is overdue.

## What's NOT done yet (deliberately)

- **Writes** (fulfill, cancel, refund) — requires `write_*` scopes and confirm-modal wiring on each action.
- **DB cache** — Postgres / SQLite mirror. The right tool the moment you have >1 user.
- **Webhooks** (`orders/create`, `orders/updated`, `inventory_levels/update`, `products/update`). Needs a public HTTPS endpoint and HMAC verification.
- **Products, customers, inventory endpoints** — same pattern as orders; copy [server/shopify/orders.ts](../server/shopify/orders.ts) and tweak.
- **Etsy** — parallel connector behind the same `/api` surface. The `channel` field on `OrderRecord` already supports it; today every order is Shopify-only.

## Plaid + Stripe (Pass 4)

The finance panel now connects to Plaid (bank reconciliation) and Stripe (1099-K gross). See [design/finance-audit.md](../design/finance-audit.md) for the full integration write-up and [.env.example](../.env.example) for the env vars. Both fall back to mocks when keys aren't set, so the UI keeps working.

## Next-slice checklist

When you're ready to move past on-demand reads:

1. Pick a DB. SQLite via `better-sqlite3` is fine to start; Postgres if you'll have more than one machine reading.
2. Schema: orders, products, customers, inventory_levels — mirror the GraphQL types.
3. Backfill: one-time crawl through all four collections.
4. Webhooks: register via Shopify admin or programmatically; verify HMAC on every payload; upsert into the DB.
5. Swap `listOrders` to read from the DB; keep GraphQL only for the backfill and ad-hoc lookups.

That's it. The current slice keeps the architecture honest — there's nowhere for stale state to hide because there's no state.
