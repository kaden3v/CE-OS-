# Etsy integration (poll-based)

Etsy's Open API v3 has **no order webhooks**, so this integration *pulls*: a
`pg_cron` job calls the `etsy-sync` edge function every 10 minutes, which fetches
receipts modified since the last cursor and imports each new one through the same
`_shared/import-order.ts` path the Shopify webhook uses.

```
pg_cron (every 10 min) ──▶ etsy-sync ──▶ Etsy getShopReceipts ──▶ importNormalizedOrder
                                                                        └▶ orders (channel "etsy")
```

Everything is built and inert until credentials are present — nothing breaks
before then; `etsy-sync` simply returns `{ ok: true, skipped: "etsy not configured" }`.

> **Auth gotcha (learned the hard way):** Etsy's API requires the `x-api-key`
> header to be `"{keystring}:{shared_secret}"` (colon-joined). The keystring
> *alone* is rejected with `"Shared secret is required in x-api-key header"`.
> The keystring on its own is still the OAuth `client_id` (token exchange/refresh).
> Also, `getMe` needs the `shops_r` scope (which we don't request), so the shop
> id is resolved via `getShopByOwnerUserId` using the user id embedded in the
> access token prefix (`"{user_id}.{secret}"`).

## One-time setup (when you're ready to go live)

1. **Create an Etsy app** at <https://www.etsy.com/developers/your-apps> →
   note the **keystring** (API key). Add this callback URL to the app:
   `https://jagcnaxdxiummknyrxhj.supabase.co/functions/v1/etsy-oauth`

2. **Seed config** (server-only `integration_config`; service-role writes only):
   | key                   | value                                   |
   | --------------------- | --------------------------------------- |
   | `etsy_keystring`      | your app's keystring (API key)           |
   | `etsy_shared_secret`  | your app's shared secret (required for API calls) |
   | `etsy_sync_token`     | any long random string (gates the cron + OAuth start) |

3. **Deploy the functions** (`verify_jwt = false` for both):
   `etsy-oauth`, `etsy-sync` — and redeploy `shopify-webhook` (now shares
   `_shared/import-order.ts`; behavior unchanged).

4. **Authorize once** — open in a browser:
   `https://jagcnaxdxiummknyrxhj.supabase.co/functions/v1/etsy-oauth?token=<etsy_sync_token>`
   This runs the OAuth+PKCE dance, stores `etsy_refresh_token`, and best-effort
   stores `etsy_shop_id` (set it manually if the auto-resolve fails).

5. **Apply the cron migration** `20260611160000_etsy_sync_cron.sql` (enables
   `pg_cron` + `pg_net`, schedules `etsy-sync-poll` every 10 min).

That's it. The next poll imports any paid receipts from the last 90 days, then
each subsequent run only picks up what changed since the stored cursor.

## Config keys reference

| key                   | written by | purpose                                  |
| --------------------- | ---------- | ---------------------------------------- |
| `etsy_keystring`      | you        | app API key / OAuth client_id            |
| `etsy_shared_secret`  | you        | joined with keystring for the `x-api-key` header |
| `etsy_sync_token`     | you        | token gating the cron + OAuth start      |
| `etsy_refresh_token`  | etsy-oauth | long-lived token; auto-rotated on refresh |
| `etsy_shop_id`        | etsy-sync  | numeric shop id (self-healed from the token) |
| `etsy_last_synced_at` | etsy-sync  | cursor: max receipt `updated_timestamp`  |

## Manual sync / test

`etsy-sync` can be invoked directly (the cron just does this on a timer):

```
curl -X POST "https://jagcnaxdxiummknyrxhj.supabase.co/functions/v1/etsy-sync?token=<etsy_sync_token>"
```
