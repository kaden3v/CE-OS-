# Inventory System Audit — 2026-06-30

Multi-agent audit (6 dimensions, each finding adversarially verified against the live
production database, project `jagcnaxdxiummknyrxhj`). 29 of 30 findings confirmed.

## Bottom line

**When you sell a plant, the inventory number does not change — and never has, for any of
your 227 real sales.** The system shows 80 units in stock: the same 80 typed in by hand,
disconnected from what has actually sold.

The decrement *math* is correct. The problem is a **broken link**: imported Etsy/Shopify
order items are saved with no connection to a plant, and the decrement trigger looks up
which plant to subtract using exactly that (missing) link — so it finds nothing, subtracts
nothing, and exits silently with no error.

**Root cause:** channel imports write every order item with `cultivar_id = null` AND
`inventory_id = null` (`import-order.ts:248-249`); the trigger matches on those two fields
(`20260611200000_inventory_growout_tiers.sql:39-51`) and `continue`s when both are null.
Live proof: 295/296 order items have no link · 227 shipped/delivered orders · **0 stock
decrements ever** · 80 units untouched.

Every other inventory issue is either a consequence of, or masked by, this missing linkage.

---

## Findings (by severity)

### CRITICAL
1. **Imported sales never link to inventory → no sale decrements stock (silent no-op).**
   227 sales / 329 units → 0 stock movement. Counts are fiction relative to actual sales.
   *Fix:* resolve each line item to a `cultivar_id`/`inventory_id` at import; backfill history;
   log a visible "unmatched sale" warning when an item resolves to nothing.

### HIGH
2. **Decrement trigger is `AFTER UPDATE` only** — an order imported *already* shipped fires no
   UPDATE, so it never decrements (true for the one linked item today). *Fix:* add an
   `AFTER INSERT` path; gate consumption on an idempotency marker.
3. **Cancelled/refunded orders never restore stock.** Decrement-only trigger; a shipped→refunded
   move (two clicks in the UI) leaves stock permanently down. *Fix:* add a reversal branch.
4. **No tier promotion; tier moves are raw number edits with no conservation.** The 3-tier
   maturation lifecycle has no "promote N units" action — three independent boxes the user must
   balance by hand. In practice all 80 units sit in one tier. *Fix:* atomic Promote action, or
   collapse tiers.
5. **COGS is $0 for 227 sales → net profit overstated by the entire cost of goods.** COGS comes
   only from production runs (0 logged), never tied to sales. P&L treats every sale as ~100%
   margin. *Fix:* per-unit cost basis recognized at the sale decrement.

### MEDIUM
6. **Status round-trip (shipped→processing→shipped) decrements twice** — guard keys off
   `old.status`; no restore on exit. *Fix:* make consumption idempotent per order (`consumed_at`).
7. **Loss form asks which tier, but `mortality_events` has no tier column** — the answer is
   discarded. *Fix:* add a `stage` column.
8. **Mortality decrement is client-side and non-atomic** — two sequential browser writes; insert
   can succeed while the stock update fails. *Fix:* move to a DB trigger.
9. **Propagation→inventory is free-text name match** — typos silently create duplicate inventory
   rows. *Fix:* add `cultivar_id` to `propagation_batches`; match on it.
10. **No unique constraint on `inventory(org_id, cultivar_id)`** — cultivar-match decrement is
    non-deterministic if a cultivar ever has two rows. *Fix:* partial unique index.
11. **Manual stock edits log only the plant name** — no old→new delta; counts aren't auditable.
    *Fix:* log per-tier deltas like Log-Loss does.
12. **UI foregrounds 3 tiers but 100% of stock is in one** — two columns always 0, "Sale-Ready
    low" warning permanently lit on every plant. *Fix:* collapse to one count or suppress empty-tier warnings.
13. **Production COGS depends entirely on manual run logging** with no coupling or self-detection.
    *Fix:* recognize COGS at sale time; surface a "COGS not configured" signal.

### LOW
14. USPS delivered→shipped downgrade writes no audit-log entry (and re-arms the round-trip path).
15. Oversell (stock < qty) silently clamps to 0 and only logs a buried note.
16. Stock editor saves a full snapshot (set, not delta) → concurrent edits silently reverted.
17. No DB-level `CHECK (stock >= 0)` — UI clamps are the only guard.
18. Number fields coerce blank/invalid input to 0 mid-typing.
19. Partial shipments aren't modeled — consumption is all-or-nothing per order.
20. System/service-role audit writes have `null actor_id` (now labeled "System" in Activity).

### POSITIVE (Info)
21. **Security, tenant isolation, and supply-cost math are sound.** Every table enforces org
    isolation; SECURITY DEFINER functions are `search_path`-pinned; supply purchase/recost/reversal
    math is correct. **The fix is additive, not a rewrite.**

---

## Recommended design — simple and effective

Make a sale link to a plant and subtract one, reliably, at sale time. Concretely:

1. **Link each Etsy/Shopify listing → a plant in CE-OS, once** (you have ~6 plants — minutes of setup).
2. **Stop nulling the link at import** (`import-order.ts:248-249`): resolve each item to an
   `inventory_id` (via the map, falling back to a normalized name match); flag + log anything unmatched.
3. **Decrement on every real ship event, exactly once:** add an `AFTER INSERT` path alongside
   `AFTER UPDATE`; gate on `orders.inventory_consumed_at` so insert/update/round-trips can't double-subtract.
4. **Add a reversal path:** cancelled/refunded from shipped/delivered → add stock back, clear the marker, log it.
5. **Backfill history:** run the decrement once over the 227 existing shipped/delivered orders.
6. **Collapse tiers to a single "In stock" count** (keep an optional "Grow-Out / not-for-sale" bucket
   only if you actually grow plants up). Removes the always-zero columns, the false warning, and the
   no-conservation edit risk in one move.
7. **Tie cost to the sale:** per-unit `cost_basis` on inventory/cultivar; the decrement records COGS so
   net profit stops reading 100% margin.
8. **Guardrails:** `CHECK (stock >= 0)`, partial unique index on `(org_id, cultivar_id)`, a visible
   "unmatched/oversold" flag instead of buried notes, and real deltas in the manual-edit audit line.

**Why this is simpler:** the current 3-tier model + transition-only trigger is more machinery than the
business uses and still moves zero counts. One sellable count per plant, linked to its listing,
decremented by one atomic idempotent event at ship time, reversed on refund — fewer moving parts than
today, and it actually changes the number when a plant sells. Keep the DB trigger (right place for
atomicity; security is already solid) — just feed it real links and a once-only marker.

---

## Decisions needed before implementing

1. **Tiers vs single count:** do you grow plants up over time (seedling → sale-ready → specimen), or
   list everything as ready-to-sell? (Latter → collapse to one "In stock" number.)
2. **Listing linking:** map each Etsy listing once (best accuracy), or auto name-match with a review step?
3. **Refund/cancel restock:** auto-add stock back on refund after shipping? (Dead-on-arrival returns may
   not be resellable.)
4. **Cost basis:** willing to enter a per-unit cost per plant (so COGS/true profit work), or just surface
   "COGS not configured" for now?
5. **Oversell:** when qty exceeds tracked stock, block/alert, or sell-and-flag?
6. **Grow-Out sellability:** ever sellable as a last resort, or strictly never?
