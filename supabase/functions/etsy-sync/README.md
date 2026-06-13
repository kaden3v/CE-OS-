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
| `etsy_ledger_sync`    | you        | `"on"` enables the Payment Account Ledger → expenses import |
| `etsy_ledger_cursor`  | etsy-sync  | cursor: max ledger `created_timestamp`    |

## Ledger → expenses (shipping labels + fees)

The seller's real costs — shipping/postage labels, listing/transaction/processing
fees, Etsy Ads — live in Etsy's **Payment Account Ledger**, NOT on receipts (a
receipt's `total_shipping_cost` is what the *buyer* paid). The poller imports
them as `expenses` rows (`source = 'etsy'`, deduped by `external_id`
`etsy-ledger:{entry_id}`), classified into Schedule C lines by
`_shared/etsy-ledger.ts`. Needs only the `transactions_r` scope OAuth already
grants — **no re-auth**.

Because actual Etsy fees now post as expenses, migration
`20260612020000_etsy_ledger_expenses.sql` retires the per-order Etsy fee
*estimate* (`channel_fee_rules.import_actuals = true` for Etsy gates it out of
`_finance_kpi_window` / `finance_revenue_*` / `finance_cashflow`) so fees aren't
double-counted. Net Profit is unchanged; fees move from a net-revenue contra to a
Commissions-and-fees expense line.

**Go-live (do these in order):**

1. **Dry-run / verify classification** (no writes) — confirm the description→bucket
   map and that amounts are in cents:
   ```
   curl -X POST "https://jagcnaxdxiummknyrxhj.supabase.co/functions/v1/etsy-sync?token=<etsy_sync_token>&inspect=ledger&days=90"
   ```
   Review the returned `entries[]` (`description`, `count`, `sumRaw`, `sign`,
   `classifiedAs`). Anything important showing `classifiedAs: "SKIP"` or landing in
   `Etsy fees (uncategorized)` means the patterns in `etsy-ledger.ts` need a tweak.
2. **Apply** migration `20260612020000` and regen types. (Inert for reporting:
   Etsy fees stay estimated because `import_actuals` defaults false.)
3. **Enable** — atomically, so there's no gap where Etsy fees are uncounted:
   ```sql
   update public.channel_fee_rules set import_actuals = true where lower(channel) = 'etsy';
   update public.integration_config set value = 'on', updated_at = now() where key = 'etsy_ledger_sync';
   ```
   The next poll backfills the last 365 days, then each run picks up new entries by
   cursor. From this moment Etsy fees come from actuals (estimate suppressed).

## Manual sync / test

`etsy-sync` can be invoked directly (the cron just does this on a timer):

```
curl -X POST "https://jagcnaxdxiummknyrxhj.supabase.co/functions/v1/etsy-sync?token=<etsy_sync_token>"
```
