# CEOS — Canyon Exotics Operations

Internal nursery operations dashboard. React 19 + Vite + Tailwind v4, Supabase for auth + persistence + storage. Deployed on Vercel.

**Live:** https://ce-os-eight.vercel.app

## What it does

| Page | Backed by | Notes |
|---|---|---|
| Dashboard | live aggregates | Active orders / plants in stock / pending shipments / MTD revenue, recent orders, pending tasks |
| Orders | `orders` + `order_items` | Multi-channel (Shopify/Etsy/wholesale/direct), line-item editor, status workflow |
| Inventory | `inventory` + `cultivars` | Per-stage stock (juvenile/mature/flowering), cultivar dropdown, photo upload to Storage |
| Cultivars | `cultivars` | Master registry — link inventory and listings here |
| Propagation | `propagation_batches` | Kanban: mother → division → establishment → ready |
| Customers | `customers` (+ join to `subscriptions`) | Contact info, channel handles, active Rosette+ tier |
| Listings | `listings` | Drafts per channel (Shopify/Etsy/wholesale) |
| Vendors | `vendors` | Supplier directory |
| Supplies | `supplies` (vendor-linked) | Reorder thresholds, low-stock badges |
| Expenses | `expenses` (vendor-linked) | Track op costs |
| Tax Report | derived from `expenses` | By-category & by-month, CSV export |
| Cultivar Profit | derived from `order_items` + `cultivars` | Revenue & units per cultivar |
| Licenses | `licenses` | Permit/expiry tracking with 60-day warning |
| QR Generator | `qr_codes` | Code per cultivar, persists scan counts |
| Print Queue | `print_jobs` | Status workflow |
| Shipping | `shipments` (+ join to `orders`) | Order link, tracking, weather windows (illustrative) |
| Settings | `profiles` | Display name save, sign-out / exit demo |

## Stack

- **Frontend:** React 19, Vite, Tailwind v4, react-router 7, recharts, framer-motion, @tanstack/react-table
- **Backend:** Supabase (Postgres + RLS + auth + storage)
- **Hosting:** Vercel (env vars + SPA rewrites)

## Auth flow

CEOS is invitation-only. There is no public signup.

1. Visitor lands on `/sign-in` → enters email + password (existing users) or clicks **Request access**
2. **Request access** form: email + chosen password + confirm + name + optional message
3. Submission goes to the public Edge Function [`request-access`](./supabase/functions/request-access/index.ts) (verify_jwt=false). Service-role key inside the function:
   - Validates input
   - Dedupes: existing pending/approved request OR active auth user → silent success (no enumeration)
   - Creates an `auth.users` row with the chosen password
   - **Bans the user** (`banned_until` set 100 years out via `auth.admin.updateUserById`) — server-side enforcement; sign-in is rejected with `user_banned`
   - Inserts the `access_requests` row linked to the new user
4. Admin signs in, opens **Access Requests** in the sidebar (only visible if `profiles.is_admin = true`)
5. **Approve** → [`process-access-request`](./supabase/functions/process-access-request/index.ts) clears `banned_until` via service-role. The user can now sign in with the password they already chose. **No email round-trip.**
6. **Deny / Revoke** → deletes the `auth.users` row entirely (cascades the profile + any owned data). No password remains on disk for denied requests.

**Admin role is allowlist-controlled.** Emails in the `admin_emails` table become admin on signup automatically (the `handle_new_user` trigger reads the allowlist). Bootstrap admins live there.

**Why the ban-and-clear pattern**: it gates the user behind admin review without us having to store the password ourselves (Supabase manages the bcrypt hash like any normal user). The unban is a single column flip — fastest possible "approve" UX.

**Demo mode** is still available — clicks "Try the demo" button → localStorage backend, no signup, no DB writes. For tryers/testers.

### Preventing dangling no-password accounts

Supabase will create an `auth.users` row the moment any email-based auth flow is started for an address (magic-link, OTP, invite). If the recipient never clicks the email link, that row persists forever with no password. The first invite-vs-magic-link experiment in this project produced exactly such an orphan; we've removed it.

**To prevent recurrence:**

1. **Magic-link / OTP is disabled in Supabase Auth settings.** In the dashboard → **Authentication → Providers → Email**, toggle off "Enable email signup with one-time password". Only password-based sign-in remains. The `auth.users` row created by `inviteUserByEmail` is the only valid path to a new user, and that path is gated by an admin approval.

2. **Invitations have a 7-day TTL.** When you approve a request, the edge function stamps `invited_at` and `invite_expires_at` on the row. The admin UI shows three states:
   - **Awaiting setup** — invited, link not yet expired
   - **Invite expired** — invitee never set a password; clean up via Re-send or Revoke
   - **Active** — assumed once invite expires (we don't currently re-poll `auth.users.email_confirmed_at` from the client; the DB cleanup function handles the truth)

3. **Nightly cleanup.** A pg_cron job (`purge_stale_invites`, daily at 03:00 UTC) calls `public.purge_stale_unconfirmed_users(7)`. It deletes any `auth.users` row that:
   - has no `email_confirmed_at`,
   - was created over 7 days ago,
   - is linked to an `access_requests.user_id`.
   
   And re-marks the access request as denied with reason "Invitation expired — never completed setup". So the admin sees what happened and can re-issue if appropriate.

4. **Re-invite & Revoke buttons** in the admin UI let you act before the cleanup runs. Re-invite re-sends the email and bumps the expiry. Revoke deletes the auth user immediately.

## Architecture

- **Auth:** [`src/contexts/AuthContext.tsx`](./src/contexts/AuthContext.tsx) — `signInWithPassword`, `resetPasswordForEmail`, `requestAccess`, `signOut`, plus `isAdmin` flag pulled from `profiles.is_admin`.
- **Data layer:** [`src/hooks/useEntity.tsx`](./src/hooks/useEntity.tsx) — generic table hook. Reads/writes Supabase when authed, falls back to localStorage in demo. Defense-in-depth: writes always use `auth.uid()` server-side AND `.eq('user_id', user.id)` on the client to prevent cross-account writes if RLS is ever misconfigured.
- **Joins:** [`src/hooks/useOrders.tsx`](./src/hooks/useOrders.tsx) — orders + order_items + customer in one fetch. New orders insert the header then items, with rollback on partial failure.
- **Errors:** [`src/lib/dbErrors.ts`](./src/lib/dbErrors.ts) — translates Postgres error codes into friendly messages. Raw `error.message` is logged to console but never surfaced (avoids schema/policy info leakage).
- **Photos:** [`src/components/PhotoUploader.tsx`](./src/components/PhotoUploader.tsx) — uploads to `plant-photos` bucket under `<user_id>/<inventory_id>/...`. Bucket is public-read (signed URLs avoid exposing list); writes are RLS-restricted to the authed user's path prefix. 8 MB client cap, 10 MB server cap.

## Edge Functions

| Function | verify_jwt | Purpose |
|---|---|---|
| [`request-access`](./supabase/functions/request-access/index.ts) | **false** (public) | Accepts `{email, password, name, message}` from anyone. Creates a banned auth user + pending request. Deduplicates silently. |
| [`process-access-request`](./supabase/functions/process-access-request/index.ts) | true | Admin-only. Approve clears the ban; deny / revoke deletes the user entirely. JWT-verified caller, then `is_admin` re-check before any service-role action. |

The service role key only lives in Edge Function env. The browser never sees it.

## Schema

21 tables, all RLS-enabled. See [`supabase/schema.sql`](./supabase/schema.sql) for the source. Generated types in [`src/lib/database.types.ts`](./src/lib/database.types.ts) (regenerate via `npx supabase gen types typescript --project-id jagcnaxdxiummknyrxhj`).

```
auth.users → profiles
            ↓
   cultivars ← inventory ← qr_codes
                       ↘ mortality_events
                       ↘ plant_photos (Storage path: <user_id>/<inventory_id>/...)
   propagation_batches
   listings → cultivars

   vendors ← expenses, supplies
   customers ── subscriptions (Rosette+ tier tracking)
            ↘ orders → order_items → cultivars/inventory
                    ↘ shipments → print_jobs

   tasks, licenses (standalone)
```

## Multi-tenancy roadmap

Currently each authed user owns their own world (every row has `user_id`). To support shared data across multiple users (e.g. you + a hire), add an `organizations` table + `org_memberships(user_id, org_id, role)` join table, swap `user_id` columns for `org_id`, and update RLS policies from `auth.uid() = user_id` to `org_id IN (SELECT org_id FROM org_memberships WHERE user_id = auth.uid())`. The `useEntity` hook keeps working with one line change.

## Run locally

```bash
npm install
cp .env.example .env.local        # paste your Supabase URL + anon key
npm run dev                        # http://localhost:3000
```

If `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are unset, the sign-in page auto-redirects to demo (browser-only data).

## Supabase setup (one-time, already done for `jagcnaxdxiummknyrxhj`)

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor → New query** → paste contents of [`supabase/schema.sql`](./supabase/schema.sql) → Run.
3. **Authentication → Providers → Email**: enable Email + Magic Link.
4. **Authentication → URL Configuration**: add `http://localhost:3000/**` and your Vercel URL under Site URL + Redirect URLs.
5. **Storage**: bucket `plant-photos` is created by the migration; verify it exists in Storage tab.
6. Copy **Project URL** + **anon public key** (Settings → API) into `.env.local`.

## Deploy to Vercel

Already wired:

```bash
vercel deploy --prod --yes
```

Env vars are persisted on the project (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`). [`vercel.json`](./vercel.json) handles SPA rewrites.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start dev server on port 3000 |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Serve the built bundle locally |
| `npm run lint` | TypeScript typecheck (`tsc --noEmit`) |
