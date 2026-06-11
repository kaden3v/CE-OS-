# CEOS — Product Review To-Do List

From the full app review (2026-06-10): code-level UX/logic scan of every page + competitive research
against 14 comparable systems (Picas, Plant Partner, SBI, GrowPoint, MyPlantShop, Odoo, Airtable,
monday.com, Craftybase, inFlow, Katana, Cin7/Sortly, ShipStation/Veeqo/Pirate Ship, Vela).

**Verdict in one line:** the entity model is right and the niche is genuinely empty, but the app
currently mixes real data with fake data (a trust problem), and its workflows are silos (orders,
inventory, propagation, and shipping never talk to each other).

Severity: **P0** = trust/broken now · **P1** = connect the core workflows · **P2** = money truth ·
**P3** = integrations · **P4** = differentiators.

---

## P0 — Fix trust and broken UI (the app must never show fake numbers as real)

- [x] **Replace or clearly label the fake Reporting tab** — `Dashboard.tsx:15-28` hardcodes
      REVENUE_DATA / CHANNEL_DATA / CULTIVAR_DATA; `Dashboard.tsx:286-300` hardcodes the entire
      customer-cohort retention heatmap. The stat tiles above them compute *real* MTD revenue from
      orders — so the owner sees two conflicting revenue numbers. Compute from `orders` or remove.
- [x] **Remove hardcoded "Recent" sidebar** (`Layout.tsx` — Order #1284, Pinguicula 'Pirouette',
      Marcus Aldana never change) — replace with last-3 real records or drop.
- [x] **Hardcoded "KC" avatar** in the topbar → derive from the signed-in profile's display name.
- [x] **Wire the Inventory search box** (`Inventory.tsx:192`) — it renders but filters nothing.
- [x] **Customers: add edit + delete** — today a misspelled customer name is permanent.
- [x] **Orders: allow editing line items** after creation (today only status can change).
- [x] **Propagation: allow editing a batch** (count, cultivar, est-ready) after creation.
- [x] **QR Generator: Print/Download buttons are toast-only theater** — make them generate a real
      printable sheet (or enqueue into print_jobs for real).
- [x] **Command palette: label it "Navigation" or make ⌘K search real data**
      (orders/customers/cultivars) — currently nav-only, which violates the search expectation.
- [x] **Shipping weather panel** says data is "illustrative" in small print — hide the panel until
      a real weather API is wired (P3) so no one makes a ship/hold decision on fake conditions.

## P1 — Connect the workflows (turn silos into a pipeline)

- [x] **Decrement inventory on fulfillment** — shipping an order should consume stock from the
      matching inventory stage; today you can ship 100 units of a plant you have 0 of.
- [x] **Propagation → Inventory conversion** — a "ready" batch should convert into inventory stock
      with one action; today the owner re-enters the data by hand.
- [x] **Order ⇄ shipment status sync** — marking an order shipped should move its shipment (and
      vice versa); today they are tracked independently and drift.
- [x] **Listings stock ⇄ inventory stock** — listings carry their own stock number that never syncs
      with inventory; pick one source of truth.
- [x] **Surface low-stock where decisions happen** — dashboard widget + notification when a supply
      crosses its reorder threshold or a cultivar's saleable stock hits zero (thresholds exist,
      alerts don't).
- [x] **Make notifications real** — NotificationCenter is localStorage-only; emit actual events
      (new order, low stock, license expiring, task assigned to you) — task assignment notifications
      especially, now that tasks are assignable.
- [x] **Pagination on Expenses/Orders/Customers tables** — Expenses already fetches all 857 rows at
      once; add server-side pagination or virtualization before the data grows.
- [x] **Decide fate of orphaned tables** — `mortality_events` (no UI at all: either build a simple
      "log loss" action on inventory or drop it), `subscriptions` (read-only; add create/cancel on
      the customer panel), `etsy_imports` (4 stale rows, no UI: finish the import path in P3 or drop),
      `qr_codes.scan_count` (always 0 — needs a public scan redirect endpoint or remove the column
      from the UI).

> P1 shipped 2026-06-10. Notes: the order⇄shipment sync + inventory-decrement triggers live in
> migrations `20260610090000_p1_workflow_sync.sql` + `20260610100000_p1_fix_shipment_timestamps.sql`
> — **applied to prod 2026-06-10 and verified end-to-end** (self-rolling-back live test: both sync
> directions, mature-first consumption, timestamp stamping, audit rows). Listings now show "Listed qty" vs real "On hand" from inventory (true channel
> sync arrives with P3). Orphaned-table decisions: mortality_events got a "Log loss" UI;
> subscriptions got start/cancel on the customer panel; etsy_imports is superseded by the P3 Etsy
> sync; qr_codes.scan_count stays dormant until the P4 mobile scan workflows.

## P2 — Money truth (the owner can't see profit today)

- [x] **Production runs that consume supplies → real COGS** — Finances → Production logs runs
      (description, cultivar, units, labor hours×rate, supply lines with snapshotted unit costs),
      decrements supply stock, and CultivarProfit now shows Est. COGS + margin per cultivar.
      Migration `20260610110000_p2_production_cogs.sql` **pending prod apply**.
- [x] **Sales-tax report** — TaxReport now has a Sales section: gross sales, tax collected,
      by channel, and by ship-to state (from each order's shipment), with year filter.
- [x] **Schedule C-ready COGS summary** — TaxReport's "Cost of Goods" section: materials,
      labor, and total COGS for the selected year, from production runs.
- [x] **Wholesale invoicing + availability list** — printable invoice from any order (Orders
      detail → Invoice) and a printable availability list of mature/flowering stock (Inventory →
      Availability, managers). *Per-customer price tiers deferred — rides with P3 channel work.*
- [x] **Accounting export** — flat per-order Sales CSV + Expenses CSV from TaxReport
      (QuickBooks-importable columns). Deeper sync (API) can ride with P3.

## P3 — Integrations (already on the roadmap; ordering confirmed by user: Shopify → Etsy → Shipping)

- [ ] **Shopify order sync** — webhook edge function → orders/order_items + stock push-back
      (oversell prevention). Table stakes in every comparable system.
- [ ] **Etsy order sync** — same; supersedes the abandoned etsy_imports CSV path.
- [ ] **Shipping labels + rates** — integrate Shippo/EasyPost or pair with Veeqo (free, Amazon-owned,
      native Etsy+Shopify) rather than rebuilding; print queue then receives real label PDFs.
- [ ] **Real weather API + weather-hold automation** — rule: destination ZIP forecast <35°F or >95°F
      within 3 days → auto-hold + tag + customer email + heat-pack suggestion. **No competitor does
      this natively** (ShipStation rules are static; Logee's/The Sill do it manually) — this is
      CEOS's leapfrog feature, not catch-up.

## P4 — Differentiators worth building (validated by competitor research)

- [ ] **Lot codes on propagation batches → traceability** (SBI seed-lot control): stamp lot IDs on
      QR labels so a pest/disease/inspection finding traces to source flat and shipped orders;
      pairs with the existing license/compliance module (CITES/state inspections are real for
      carnivorous plants).
- [ ] **Grow library / care schedules per cultivar** (Plant Partner): repot intervals, feeding,
      dormancy triggers auto-spawn dated tasks on the kanban.
- [ ] **Bench/space capacity planning** (Picas/Plant Partner): stage footprint × batches vs
      greenhouse capacity → "can I start 10 more flats of Nepenthes?"
- [ ] **Cross-channel listing publish + listing completeness score** (Vela charges $10–40/mo for
      just this): one-click publish a cultivar listing to Etsy + Shopify from the drafts page.
- [ ] **Mobile scan-driven workflows** (inFlow/Sortly): QR labels already exist; scanning one on a
      phone should open that plant's record / decrement stock / log mortality.

## Platform hygiene (carried from earlier phases)

- [ ] Enable leaked-password protection (Supabase Auth dashboard — last open advisor).
- [ ] Deploy the org-aware frontend to Vercel (activates Team/Activity/Import for the team).
- [ ] Audit the 4 backfilled workspace members on /team; remove any that shouldn't have access.
- [ ] CONTRACT migration: make org_id NOT NULL, drop user_id ownership semantics (keep as
      created_by), switch user_id FKs to SET NULL so deleting an account can't cascade-wipe org data.
- [ ] Tests: zero coverage today vs an 80% standard — start with order entry, approval flow,
      CSV import parsing, and the inventory-decrement logic once it exists.
- [ ] Cross-member photo viewing: plant photo storage paths are per-user; teammates see the DB row
      but may not render another member's photo.

---

## Market positioning (why this is worth finishing)

The cheapest alternative stack for this business — Craftybase (~$24/mo) + Veeqo (free) + Vela
(~$10/mo) + QuickBooks — still cannot model growth-stage inventory, propagation, license expiry, or
weather holds. Nursery ERPs (Picas/SBI/Plant Partner, quote-only) have the production depth but no
Etsy/DTC world. CEOS's unique ground: **stage-based live-plant inventory + e-commerce channels +
compliance + weather-aware shipping in one tool.** The to-do list above closes the table-stakes gaps
(sync, COGS, labels) while doubling down on the four features nobody else has.
