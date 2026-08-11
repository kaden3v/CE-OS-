# CEOS — Polish & Mobile Review (2026-08-10)

Full-app review of the UI layer, focused on "is this refined, and does it actually work on a
phone." Scope: all 34 routes, the shared component layer, the design tokens, and the surrounding
engineering hygiene.

**Baseline is healthy.** `tsc --noEmit` clean, 222 unit tests pass across 23 files, `vite build`
succeeds in ~3s. Nothing here is on fire. The problems are consistency and mobile correctness:
the app was built desktop-first and given a mobile pass that fixed the *shell* (safe areas, `dvh`,
bottom nav, 16px inputs) but never reached the *pages*.

**One structural bug causes most of the mobile breakage.** Fix `F0` first — roughly half the
symptoms below disappear with it.

Severity: **P0** = broken or misleading on a phone · **P1** = consistency foundation ·
**P2** = refinement · **P3** = engineering hygiene.

---

## Verification notes

Findings marked **[verified]** were reproduced in a real browser at 375×812, not inferred from
markup. Findings marked **[static]** come from reading the code.

Authenticated pages could not be visually exercised: this worktree has no `VITE_SUPABASE_URL` /
`VITE_SUPABASE_ANON_KEY`, so the app redirects to `/sign-in`. Sign-in itself renders correctly on
mobile. The page-level findings below are code-level and, where layout maths mattered, reproduced
with faithful standalone repros at phone width. A visual pass over the authenticated pages is
listed as its own task (`T12`).

---

## P0 — Mobile: broken or misleading

### F0. Every page overlay is trapped beneath the topbar and the mobile tab bar **[verified]**

`Layout.tsx:367` renders `<main className="flex-1 overflow-auto relative z-0">`. A `z-index` on a
flex item creates a **stacking context**, so *everything rendered inside `<main>` is clamped to
z-index 0* relative to its siblings — the header (`z-10`, [Layout.tsx:297](src/components/Layout.tsx:297))
and the mobile bottom nav (`z-40`, [Layout.tsx:372](src/components/Layout.tsx:372)).

Every page-level drawer and modal lives inside `<main>` and declares `z-50`, which does nothing
across that boundary. Hit-testing a faithful repro at 375×812 confirms it:

| Point on screen | Element that actually receives the tap |
|---|---|
| y = 20 (top) | **header** — not the drawer |
| y = 400 (middle) | drawer |
| y = height − 30 (bottom) | **bottom nav** — not the drawer |

Consequences on a phone:

- The five full-screen detail drawers — [Orders.tsx:273](src/pages/Orders.tsx:273),
  [Inventory.tsx:424](src/pages/Inventory.tsx:424), [Customers.tsx:253](src/pages/Customers.tsx:253),
  [Propagation.tsx:306](src/pages/Propagation.tsx:306), [Cultivars.tsx:109](src/pages/Cultivars.tsx:109)
  — have their **close button covered by the topbar** and their **footer actions covered by the tab
  bar**. The Orders drawer's `Invoice` / `Delete` row ([Orders.tsx:469](src/pages/Orders.tsx:469))
  sits under 64px of navigation, and its `pb-safe` doesn't help because the obstruction is a
  sibling, not padding.
- Shared `Modal` in bottom-sheet mode (`items-end` on mobile, [Modal.tsx:40](src/components/ui/Modal.tsx:40))
  renders its last 64px + safe-area under the tab bar — which is exactly where submit buttons sit.
- Modal backdrops dim the page but **not the app chrome**, so the topbar and tab bar stay bright and
  fully interactive over a "modal" dialog.

**Fix:** introduce a `<Portal>` that renders overlays into `document.body`, plus a named z-index
scale. Route every drawer, modal, sheet, toast and popover through it. Drop the `z-0` on `<main>`.

### F1. Money values are silently truncated in stat tiles on phones **[verified]**

`StatTile` renders its value as `text-2xl` with `truncate`
([StatTile.tsx:69](src/components/ui/StatTile.tsx:69)), and the tiles sit in `grid-cols-2` on
mobile. Measured at 375px with the real padding chain (page `p-4`, `gap-3`, tile `p-5`):

| Value | Width needed | Width available | Result |
|---|---|---|---|
| `$1,234` | 126px | 126px | fits |
| `$8,912.40` | 126px | 126px | fits (just) |
| `$12,345.67` | **137px** | 126px | **ellipsised** |
| `$123,456.78` | **153px** | 126px | **ellipsised** |

Anything from five figures up gets cut with an ellipsis. Because it's `truncate` rather than
overflow, it reads as a complete number — the owner sees `$12,345.6…` and has no signal that a
digit is missing. This hits Dashboard, Finances Overview, Revenue, Expenses, Subscriptions and
Licenses stat rows.

**Fix:** drop the base size to `text-xl` and step up at `sm:`, and/or go single-column for the
tile grid under 400px. Never `truncate` a currency figure — if it can't fit, it must shrink or wrap.

### F2. Toasts are invisible whenever a modal is open **[verified]**

[App.tsx](src/App.tsx) renders `<Toasts />` *before* `<BrowserRouter>`. Both the toast container
([Toasts.tsx:10](src/components/ui/Toasts.tsx:10)) and every modal declare `z-50`. Equal z-index →
later DOM sibling wins → the modal paints over the toasts. Hit-testing the toast region with a
modal open returns the modal.

This silently swallows error feedback raised from inside modals — e.g. "Couldn't create order"
([Orders.tsx:96](src/pages/Orders.tsx:96)) fires while the New Order modal is still open, so the
user sees nothing happen at all.

**Fix:** falls out of `F0` — toasts go to the top of the z-scale, above dialogs.

### F3. Command palette is unusable with the mobile keyboard open **[static]**

[CommandPalette.tsx:197](src/components/ui/CommandPalette.tsx:197) positions the palette at
`pt-[15vh]` (a `vh`, not `dvh`) with a `max-h-[360px]` result list and a footer. At 375×812 that
totals ~570px, which fits — until the software keyboard takes ~350px, leaving ~460px of visible
viewport. The result list and the footer land off-screen, so on a phone you type into a search box
whose results you can't see.

The footer also advertises `↑↓ to navigate / ↵ to select / esc to close` — three keyboard-only
hints shown to a touch user.

**Fix:** full-height sheet on mobile (`inset-0` + `dvh`), hide the keyboard hint row under `sm:`.

### F4. Touch targets below the minimum **[static]**

26 icon buttons use `p-1` or `p-1.5` around a 14–16px icon → **~24–28px** hit areas, against a
44×44px (iOS) / 48dp (Android) guideline. Concentrated in the expense table row actions, the
supplies/vendors tables, and `PhotoUploader`.

### F5. Double bottom padding on two pages **[static]**

`<main>` already reserves the tab bar with `pb-[calc(64px+env(safe-area-inset-bottom))]`
([Layout.tsx:367](src/components/Layout.tsx:367)). [Inventory.tsx:366](src/pages/Inventory.tsx:366)
and [Propagation.tsx:245](src/pages/Propagation.tsx:245) add another `pb-24` on top, leaving ~96px
of dead space at the bottom of those two pages on a phone.

### F6. Detail drawers ignore Escape and the Android back button **[static]**

All five drawers are pure state (`translate-x-full` toggled by a `selected` id). No Escape handler,
no history entry — so on Android, "back" leaves the page entirely instead of closing the panel, and
on desktop Escape does nothing. Only 5 of ~14 overlays in the app handle Escape at all
(`Modal`, `CommandPalette`, `KeyboardReference`, `ReceiptDrawer`, `Subscriptions`).

### F7. 23 of 27 list surfaces are horizontal-scroll tables with no mobile view **[static]**

Only `Inventory`, `Propagation`, `Customers` and `Licenses` render anything mobile-specific.
Everything else — Orders, Expenses, Shipping, Supplies, Vendors, Mileage, Revenue, Goals, Import,
the three report tables — is a `min-w-max` table you scroll sideways
([DataTable.tsx:41](src/components/ui/DataTable.tsx:41), [ExpenseTable.tsx:91](src/components/expenses/ExpenseTable.tsx:91)).
It's functional, not refined: reading one order means scrolling a 7-column table left and right.

---

## P1 — Consistency foundation

### F8. Three competing modal primitives

- `Modal` ([Modal.tsx](src/components/ui/Modal.tsx)) — the good one: bottom sheet on mobile,
  `dvh`-capped, Escape, backdrop tap. **15 files use it.**
- `Dialog` ([Dialog.tsx](src/components/ui/Dialog.tsx)) — framer-motion, centered, fixed pixel
  width, no Escape. **Used exactly once**, in `Licenses`.
- **9 hand-rolled overlays** in Settings, Inventory (×2), Subscriptions, Orders, Production,
  Propagation (×2), Customers (×2).

Most of the hand-rolled ones are centered cards on mobile rather than sheets, and **only 2 of 9
close on a backdrop tap** (Subscriptions, Production) — the rest trap you until you find the ✕.

### F9. No `Select` primitive

`Input` and `Button` are shared; `<select>` is not. 43 selects across 24 files, with **8+ distinct
class strings**. The dominant one (17 occurrences) is:

```
bg-bg-base border border-border-subtle rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-border-strong
```

Compare `Input` ([Input.tsx:12](src/components/ui/Input.tsx:12)): `bg-bg-elevated`,
`border-border-strong`, `rounded-[8px]`, `px-2`, and a `focus:border-accent-brand focus:ring-1`
focus treatment. So selects and text inputs sitting side by side in the same form have **different
backgrounds, different borders, different corner radii and different focus states**.

### F10. The spacing scale has been flattened

Distribution of `p-/m-/gap-` values across the codebase:

| value | 2 | 4 | 3 | 6 | 1 | 8 | 1.5 | 2.5 | 0.5 |
|---|---|---|---|---|---|---|---|---|---|
| uses | **734** | 350 | 278 | 152 | 128 | 60 | 60 | 30 | 25 |

`2` (8px) outnumbers everything else combined. It has been applied to things that need a much
tighter rhythm:

- `Badge` is `px-2 py-2` on `text-[10px]` ([Badge.tsx:16](src/components/ui/Badge.tsx:16)) — an
  8px vertical pad on 10px text makes badges **~26px tall**, reading as fat pills rather than tags.
- `Button size="sm"` is `px-2 py-2` vs default `px-4 py-2` ([Button.tsx:22-26](src/components/ui/Button.tsx:22))
  — "small" is only *narrower*, exactly as tall as a default button.
- `<kbd>` chips use `px-2 py-2` in both the command palette footer and the topbar ⌘K badge.

### F11. Animations that were written but never run **[verified]**

`animate-in`, `slide-in-from-right-8`, `slide-in-from-bottom-full` and `fade-in` are used in
[Toasts.tsx:68](src/components/ui/Toasts.tsx:68), [Layout.tsx:406](src/components/Layout.tsx:406)
(the mobile "More" sheet) and [Settings.tsx:448](src/pages/Settings.tsx:448). These are
`tailwindcss-animate` classes — **that package is not installed**, and the built CSS contains
**zero** `animate-in` rules. So the toast slide-in and the mobile sheet slide-up simply pop.

The app also runs framer-motion (128 kB) for the palette, dialog and notification animations, so
there are two animation systems where one is dead.

### F12. Ad-hoc z-index and viewport units

`z-[60]`, `z-30`, `z-40`, `z-50`, `z-20`, `z-10`, `z-0` with no scale and no rationale —
[Inventory.tsx:737](src/pages/Inventory.tsx:737) reaches for `z-[60]` to stack a nested modal.
Four places still use `min-h-screen` ([AuthContext.tsx:432,446,465](src/contexts/AuthContext.tsx:432),
[Layout.tsx:143](src/components/Layout.tsx:143)) despite the deliberate `h-dvh` decision documented
at [Layout.tsx:163](src/components/Layout.tsx:163), and the command palette still uses `15vh`.

---

## P2 — Refinement

### F13. `useEntity` swallows fetch errors — failures look like empty data **[static]**

[useEntity.tsx:78-82](src/hooks/useEntity.tsx:78) logs the error to console, clears `isLoading`, and
returns. The hook exposes no `error` in its return type, so **50 call sites across 23 files** cannot
tell "the table is empty" from "the query failed."

The user-visible result: a failed load renders `EmptyState` — *"No orders yet. Create your first
order."* — on top of data that exists. `ErrorState` is defined in `StateRenderer` and used in only
two places (`Goals`, `Inventory`), neither driven by `useEntity`.

For an app whose stated P0 principle is "never show fake numbers as real" (`TODO.md`), showing an
empty ledger on a network blip is the same class of trust problem.

### F14. 20 destructive actions use the native `confirm()` **[static]**

Orders, Expenses (×2), Inventory, Customers (×2), Propagation (×2), Settings (×2), Subscriptions,
Licenses, Production, Team, Mileage, VendorDetail, AccessRequests, PhotoUploader,
PurchaseHistoryModal. Native OS dialogs, unstyleable, visually unrelated to the app, and
particularly jarring on mobile. They're also untestable in the Playwright suite without a dialog
handler.

### F15. Small dead ends

- `ErrorState`'s **"View status" button has no `onClick`** — a dead control
  ([StateRenderer.tsx:47](src/components/ui/StateRenderer.tsx:47)).
- `LoadingTable` computes skeleton widths with `Math.random()` **inside render**
  ([StateRenderer.tsx:15](src/components/ui/StateRenderer.tsx:15)) — every re-render reshuffles the
  bars, so the skeleton visibly jitters while loading.
- `document.title` is static across all 34 routes; every history entry and tab reads
  "CEOS — Canyon Exotics".

### F16. Accessibility gaps

| Issue | Evidence |
|---|---|
| Labels not associated with controls | 143 `<label>` vs **11 `htmlFor`** (~92% unassociated) — also loses tap-label-to-focus on mobile |
| No focus trap in any dialog | Tab from an open modal walks into the page behind it |
| No focus restore on close | Focus drops to `<body>` after every dialog |
| No body scroll lock | The page scrolls behind open modals |
| Escape closes 5 of ~14 overlays | see `F6` |

---

## P3 — Engineering hygiene

### F17. CI never runs the tests

[.github/workflows](.github/workflows) runs `npm run lint` (which is just `tsc --noEmit`) and
`npm run build`. **`npm test` is never invoked** — all 222 tests pass locally and are never
enforced on a PR. No e2e in CI either.

### F18. There is no linter

`"lint": "tsc --noEmit"` is the whole story — no ESLint, no `react-hooks` rules, no
`jsx-a11y`. Several findings above (missing `htmlFor`, dead `onClick`, `any` sprawl) are exactly
what a linter would have caught for free. Note `useEntity` already carries
`// eslint-disable-next-line react-hooks/exhaustive-deps` comments for a linter that isn't there.

### F19. Coverage is library-only

`vitest --coverage`: 54.1% statements / 55.5% lines — and that number flatters the app, because it
only counts files a test imports. `src/lib` is genuinely well covered (88.6%). The UI is not:
**1 of 34 pages** has a test (`ExpenseCategories`), `useEntity` is at 1.5%, `AuthContext` at 0.4%.
No thresholds are configured despite `@vitest/coverage-v8` being installed.

### F20. `any` sprawl

134 occurrences (65 `as any`, 69 `: any`) outside generated types. Two dominant patterns: the
`DataTable` column definitions (`cell: (info: any)`) and `supabase as any` to escape the typed
client. Concentrated in Subscriptions (12), Orders (12), Listings (11), Shipping (10).

### F21. Bundle

`vendor-charts` (recharts) is **416 kB / 120 kB gzipped** — larger than React, Supabase and
framer-motion combined. It's already split into its own long-lived chunk and lazy-loaded per route,
so this is a watch item, not a problem. Dropping the dead `tailwindcss-animate` classes (`F11`)
and consolidating on one animation system would let framer-motion (128 kB) be reconsidered.

---

## The plan

Ordered so each phase unblocks the next. Phases 1–2 are where the visible payoff is.

### Phase 1 — Structural mobile fixes (P0) — ✅ **DONE 2026-08-10**

| # | Task | Addresses | Status |
|---|---|---|---|
| T1 | Add `src/components/ui/Portal.tsx` + a named z-index scale in `index.css`; remove `z-0` from `<main>`; route all overlays through the portal | **F0**, F2, F12 | ✅ |
| T2 | Migrate the 5 detail drawers to the portal; add Escape + history-back close | F0, **F6** | ◐ Escape done; back deferred → `T20` |
| T3 | `StatTile`: `text-xl` base stepping up at `sm:`; never truncate currency | **F1** | ✅ |
| T4 | Command palette → full-height sheet on mobile; hide keyboard hints under `sm:` | **F3** | ✅ |
| T5 | Normalize touch targets to ≥44px; strip the double `pb-24` on Inventory/Propagation | F4, F5 | ✅ |

**What shipped**

- **Layering scale** (`index.css`): `z-sticky` 100 · `z-nav` 200 · `z-topbar` 210 · `z-drawer` 300 ·
  `z-modal` 400 · `z-toast` 600, replacing the bare `z-50`s. `<main>` no longer carries `z-0`.
- **`<Portal>`** wraps the shared overlays (`Modal`, `Dialog`, `Toasts`, `ReceiptDrawer`), so they
  render into `document.body` and stay immune to any future ancestor gaining a
  `transform`/`filter`/`backdrop-blur` — the usual way this bug comes back.
- The 10 hand-rolled page overlays were moved onto `z-modal` but **not** restructured — `T6`
  deletes them outright, so rewriting them now would be throwaway work. Their layering is correct
  in the meantime.
- **Drawer headers** gained `pt-safe md:pt-6`. They now reach the top of the screen themselves
  rather than sitting under the topbar, so they have to clear the notch on their own.
- **`useEscapeKey`** (`src/hooks/useEscapeKey.ts`) keeps a stack of active handlers and fires only
  the innermost, so Escape over a modal-on-a-drawer peels one layer instead of two. `Modal` was
  moved onto it.
- **Touch targets** are enforced by one scoped rule — `@media (pointer: coarse) { button:has(> svg:only-child) { min 44px } }`
  — rather than editing 26 call sites. Desktop density is untouched. The Orders line-item grid's
  32px delete column was widened to 44px to match.

**Verified** (browser, 375×812): the drawer now owns the viewport at top, middle *and* bottom
(previously header/nav owned top and bottom); the command palette is a full-height sheet with the
keyboard-hint row hidden and Escape closing it; `StatTile` at `text-xl` with `p-4` tiles fits every
value through `$123,456.78` in the 134px the two-column grid allows. `tsc` clean · 222 tests pass ·
build green.

**Not verified**: the authenticated pages themselves, for the credential reason in "Verification
notes". `T12` still covers that pass.

### Phase 1 follow-up

| # | Task | Addresses |
|---|---|---|
| T20 | Close drawers on Android/browser back, by moving drawer state into a URL search param (`?view=<id>`) rather than raw `history.pushState` | **F6** (remainder) |

> Deferred deliberately. Raw `history.pushState` alongside react-router is the quick version, and
> it breaks in a way that matters: the Orders drawer contains `<Link to="/customers">`, so a
> cleanup-time `history.back()` would bounce the user off the page they just navigated to. Driving
> it from the URL fixes back *and* makes drawers deep-linkable, but it touches `globalOrderViewId`
> in `AppContext` (shared with the command palette) across 5 pages — a Phase-2-sized change, not a
> Phase 1 one.

### Also found while implementing

- **`font-compact` did not exist.** `Layout` toggled it from the Settings "density" preference, but
  the class was defined nowhere in `index.css`, so the control had never done anything. Fixed in
  `T8`.
- **Unused imports across the codebase.** A `tsc --noUnusedLocals` pass surfaces ~20, most of them
  pre-dating this work (`Layout` alone carries 9 unused lucide icons). Left alone deliberately —
  `T17` adds ESLint, which sweeps them systematically rather than one at a time.

### Phase 2 — One design system (P1) — ✅ **DONE 2026-08-10**

| # | Task | Addresses | Status |
|---|---|---|---|
| T6 | Fold the 9 hand-rolled overlays + `Dialog` into `Modal`; delete `Dialog.tsx` | **F8** | ✅ |
| T7 | Add `Select` (and `Textarea`) primitives matching `Input`; replace all 43 selects | **F9** | ✅ |
| T8 | Retune the spacing scale on `Badge`, `Button size="sm"`, `<kbd>` | **F10** | ✅ |
| T9 | Pick one animation system | **F11** | ✅ |
| T10 | Replace the 20 `confirm()` calls with a `ConfirmDialog` built on `Modal` | **F14** | ✅ |

**What shipped**

- **One modal primitive.** All 10 hand-rolled overlays (Settings, Inventory ×2, Subscriptions,
  Orders, Production, Propagation ×2, Customers ×2) now render through `Modal`, and `Dialog.tsx`
  is deleted — its single caller (`Licenses`) moved over too. `Modal` adoption went 15 → 22 files.
  Every dialog in the app now behaves the same: bottom sheet on phones, Escape, backdrop tap,
  `dvh`-capped height. `Subscriptions`' own raw Escape listener was removed — it bypassed the
  handler stack and would fire even when it wasn't the top layer.
- **`Select` + `Textarea` primitives**, sharing `FIELD_BASE` with `Input` (`ui/field.ts`). All 43
  selects and 4 textareas migrated. Verified in-browser: a `Select` and an `Input` now match on
  background, border colour, border width, radius, font size and padding — previously they differed
  on all six. The dropdown chevron is a `select-chevron` utility in `index.css`, **not** a Tailwind
  arbitrary value: `bg-[url("data:image/svg+xml,…")]` silently compiles to nothing because
  arbitrary values can't contain the spaces that SVG needs, which left every select with
  `appearance-none` and no chevron at all.
- **Spacing retuned**, measured against the running stylesheet:

  | element | before | after |
  |---|---|---|
  | `Badge` | ~26px tall | **19px** |
  | `Button size="sm"` | same height as default | **28px** (default 44px) |
  | `<kbd>` chip | ~34px | **24px** |

- **One animation system.** The three `animate-in` / `slide-in-from-*` call sites (toasts, mobile
  More sheet, Settings dev section) are ported to framer-motion, which was already a dependency
  and already drove every other overlay. `tailwindcss-animate` is *not* installed, so those classes
  had been compiling to nothing. Toasts also gained the exit animation they never had.
- **`ConfirmDialog`.** A `ConfirmProvider` + promise-based `useConfirm()` replaces all 19 native
  `confirm()` calls. Promise-shaped on purpose: every call site was already inside an `async`
  handler, so each became a one-liner (`if (!(await confirm({...}))) return;`) instead of 19 pages
  each growing their own pending-confirmation state. Destructive actions get `tone: "danger"` and
  a real verb on the button ("Delete", "Revoke", "Discard") rather than "OK".
- **`font-compact` now exists.** Settings' "Compact density" toggle wrote a class that was defined
  nowhere — the control had never done anything. It's now real CSS scoped to data tables, set on
  `<html>` rather than the app root so portalled overlays inherit it too.

`tsc` clean · 222 tests pass · build green.

### Phase 3 — Trust & accessibility (P2) — ✅ **DONE 2026-08-11**

| # | Task | Addresses | Status |
|---|---|---|---|
| T11 | `useEntity` returns `error`; wire `ErrorState` + retry into consuming pages | **F13** | ✅ |
| T12 | Focus trap + focus restore + body scroll lock in `Modal` | F16 | ◐ code done; authed visual pass still blocked on credentials |
| T13 | Add `htmlFor`/`id` to the unassociated labels | F16 | ✅ |
| T14 | Per-route `document.title`; dead "View status" button; `Math.random()` in `LoadingTable` | F15 | ✅ |

**What shipped**

- **Failed loads no longer read as empty tables.** `useEntity` and `useOrders` now expose
  `error: string | null` (via `friendlyDbError`, so raw PostgREST messages never reach the UI), and
  13 pages branch on it *before* `isEmpty`, rendering `ErrorState` with a working retry. Previously
  a network blip on the Orders page rendered "No orders yet — create your first order" over a live
  ledger.
- **`Modal` is now accessible**: focus trap (`useFocusTrap`), focus restore to the trigger on
  close, body scroll lock (`useScrollLock`, ref-counted so nested overlays don't unlock early), and
  `aria-labelledby` wired to its own title via `useId`. The dialog carries `tabIndex={-1}` as a
  fallback focus target so opening one never strands focus on the page behind.
- **94 label/control associations added**, taking `htmlFor` coverage from 11/143 to 105/143. Beyond
  screen readers, this is what makes tapping a field's label focus it on a phone. Verified in the
  browser that sign-in's fields now resolve their labels.
- **Per-route `document.title`** — every route was "CEOS — Canyon Exotics"; it's now
  "Finances · Vendors · CEOS". Verified live: the sign-in tab reads "Sign In · CEOS".
- `ErrorState`'s dead "View status" button (no `onClick`) is gone, and `LoadingTable` no longer
  calls `Math.random()` during render, which had reshuffled every skeleton bar on each re-render.

**Tests**: 222 → **235**. New `Modal.dom.test.tsx` covers portalling, `aria-labelledby`, Escape,
backdrop-vs-inside clicks, innermost-only Escape with stacked modals, scroll lock/restore, and
focus restore; `useDocumentTitle.test.ts` covers the title builder. `tsc` clean · build green.

**Two things worth recording**

- The focus trap originally filtered candidates by `offsetWidth`/`offsetHeight`. That is always `0`
  under jsdom, so the trap silently focused nothing — the failing test caught a real defect, not a
  test artifact. Visibility filtering is now by `[hidden]`/`aria-hidden` instead.
- `useDataState` (used only by `Inventory`) is a **dev-tools mock** driven by the Settings
  error/empty/loading toggles, not real data state. Inventory's `isError` therefore only ever
  reflected a dev switch; it now checks the real `useEntity` error alongside it.

### Phase 4 — Mobile-native list views (P2) — ✅ **DONE 2026-08-11**

| # | Task | Addresses | Status |
|---|---|---|---|
| T15 | Give `DataTable` a card-per-row mobile mode | **F7** | ✅ |

Built into `DataTable` rather than page by page, so all **9** consumers got it at once: under `md`
each row renders as a card — first column as the heading, the rest as labelled rows — and the table
is `hidden md:block`. Per-column overrides live in the column's `meta`:

```ts
{ accessorKey: "id",       header: "Order #",  meta: { mobileHidden: true } }
{ accessorKey: "customer", header: "Customer", meta: { mobileTitle: true } }
```

Orders and Shipping are tuned that way (the truncated uuid is noise on a card; the customer/order is
the useful heading). Everything else gets a sensible zero-config default.

Verified at 375×812 against a temporary harness (since the authed pages need credentials): cards
render one per row, no horizontal overflow, `$1,284.75` fits in full, clickable rows are real
`<button>`s — and at 1280px the table is unchanged. 7 tests in `DataTable.dom.test.tsx`.

### Phase 5 — Hygiene (P3) — ✅ **DONE 2026-08-11**

| # | Task | Addresses | Status |
|---|---|---|---|
| T16 | Add `npm test` to CI; add the Playwright audit as a separate job | **F17** | ✅ |
| T17 | Add ESLint + `react-hooks` + `jsx-a11y`; rename the current script to `typecheck` | **F18** | ✅ |
| T18 | Coverage thresholds | F19 | ✅ |
| T19 | Type the `DataTable` column defs; retire `any` where the typed client allows | F20 | ✅ |

- **CI now runs the tests.** The suite passed for months without CI ever invoking it. The `verify`
  job runs typecheck → lint → test → build.

  A second `ui-audit` job runs the Playwright audit on desktop + mobile — **gated on the Supabase
  secrets being set**, and skipped with a notice otherwise. Running it locally showed why: the spec
  drives the real sign-in form, and `SignIn` disables its inputs when Supabase isn't configured
  ([SignIn.tsx:120](src/pages/SignIn.tsx:120)), so `fill()` times out. Ungated it would have been a
  permanently red job in a repo with no secrets — worse than no job at all.
- **ESLint exists** (`eslint.config.js`, flat config, ESLint 9 — `eslint-plugin-jsx-a11y` doesn't
  support 10 yet, so all four plugins are pinned to a compatible set). `npm run lint` is now really
  linting; the old `tsc --noEmit` moved to `npm run typecheck`.

  The first run reported **129 errors / 150 warnings**. Shipping that as a blocking gate would have
  stopped every commit, so the split is: correctness rules **error** (all 29 fixed — unused imports,
  empty catch blocks, a `?:` used as a statement, two genuinely dead constants), and structural debt
  **warns** behind a `--max-warnings` baseline that can fall but never grow. Now **0 errors**.
- **Warnings 251 → 197** by typing every `DataTable` column set: `useMemo<ColumnDef<Row>[]>` plus
  reading `info.row.original.field` instead of `info.getValue()` — equivalent at runtime for an
  accessor column, but typed, so a field typo is now a compile error.
- **Coverage thresholds** wired into `vitest.config.ts` at 55/54/60/56, just under today's numbers.
  A ratchet against regression, explicitly *not* a claim that 55% is adequate — coverage only counts
  files a test imports, and most pages still have none.

**One thing worth recording**: `no-useless-escape` flagged `<\/script>` in four print-HTML template
literals. The escape is **required** — unescaped, that sequence closes the enclosing script block
when the popup parses it. An inline disable can't help (a comment inside a template literal prints
as page content — the first attempt did exactly that), so the rule is off with the reason recorded
in the config.

---

## Sequencing note

`T1` is the keystone. It is a contained change — one new component, one CSS block, and a
find-and-replace across ~14 overlay call sites — and it resolves `F0`, `F2` and most of `F12` at
once, which between them account for the majority of what "doesn't work on mobile" actually means
here. Everything in Phase 2 gets easier once overlays share one host.

`T12`'s visual confirmation is the one task that needs something I don't have: a Supabase login for
this worktree. Everything else is executable as-is.
