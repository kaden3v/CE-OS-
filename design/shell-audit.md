# Shell, Lists, Records, Motion — Audit (pre-rebuild)

Snapshot of the OS before the navigation/list/record/polish rebuild. Read with the new primitives in `src/components/nav/`, `src/components/data/`, `src/components/record/`, and `design/motion.ts`.

---

## 1. Navigation

### Routes today ([src/App.tsx:39-62](src/App.tsx:39))

| Path | Component | Type |
| ---- | --------- | ---- |
| `/` | Dashboard | landing |
| `/orders` | Orders | list |
| `/inventory` | Inventory | list |
| `/inventory/qr-codes` | QrGenerator | tool |
| `/inventory/qr-codes/analytics` | QrAnalytics | report |
| `/inventory/:id/mortality` | MortalityDetail | record |
| `/receiving` | Receiving | list |
| `/propagation` | Propagation | kanban |
| `/cultivars` | Cultivars | list |
| `/cultivars/breeding` | BreedingTracker | tool |
| `/cultivars/profit` | CultivarProfit | report |
| `/customers` | Customers | list |
| `/customers/:id/thread` | CustomerThread | record |
| `/shipping` | Shipping | list |
| `/shipping/print-queue` | PrintQueue | queue |
| `/listings` | Listings | list |
| `/finances/expenses` | Expenses | list |
| `/finances/supplies` | Supplies | list |
| `/finances/vendors` | Vendors | list |
| `/finances/tax-report` | TaxReport | report |
| `/finances/tax-report/year-end` | YearEndSnapshot | report |
| `/licenses` | Licenses | list |
| `/audit` | AuditLog | log |
| `/settings` | Settings | tool |

24 top-level routes, 3 record routes, 0 modals-that-should-be-routes (the order detail uses a global view ID in AppContext and overlays — a candidate for a true `/orders/:id` route).

### Power-user actions (>5×/day, observed in mock workflows)

1. **Jump to a specific order by number** — currently requires nav → Orders → search → click. With palette: ⌘K → "1284".
2. **Switch sections** (Inventory ↔ Orders ↔ Propagation) — currently click-only; `g i / g o / g p` shortcuts exist but undocumented.
3. **Open inventory item** — click row → no detail pattern (most pages dead-end at the row).
4. **Mark a task complete** — only from the tasks panel popover.
5. **Print a shipping label** — Shipping page → row → button.
6. **Run a scenario in demo mode** — palette-driven (good!).
7. **Trigger Claude / approve agent run** — N/A; agents don't exist yet but architecture must allow palette actions with inline arguments.

### Places the user must mouse to reach a destination

- The bottom-of-sidebar **Recent** list is mouse-only ([Layout.tsx:241](src/components/Layout.tsx:241)). No way to navigate via keyboard or palette.
- The **Finances expander** is a click-toggle; no `g f` shortcut and not in the palette.
- The **avatar / account menu** doesn't exist — the "KC" tile is decorative ([Layout.tsx:319](src/components/Layout.tsx:319)).
- **Mobile More sheet** ([Layout.tsx:362](src/components/Layout.tsx:362)) is mouse-only.
- **Tasks and Notifications popovers** are mouse-triggered, no global shortcut.
- **Workspace switcher** doesn't exist at all. The app assumes a single workspace.
- **Breadcrumb segments** are plain text ([Layout.tsx:125-130](src/components/Layout.tsx:125)) — not clickable.
- **Topbar** carries a global search affordance but no contextual actions — the wrong layout: global belongs in the palette, contextual belongs in the topbar.

### Keyboard shortcuts in the wild

Implemented in [Layout.tsx:75-123](src/components/Layout.tsx:75) but not documented anywhere except [KeyboardReference.tsx](src/components/ui/KeyboardReference.tsx):

| Key | Action |
| --- | ------ |
| `⌘K`, `⌘/` | open palette / shortcut reference |
| `?` | open shortcut reference |
| `⌘N` | "Quick Add" (currently a toast, no behavior) |
| `g d / o / i / p / c / l / u / s / f` | route jumps |

Missing per spec: `⌘\` (toggle sidebar), `g a` (agents), `g r` (reports), `esc` (close everything — partial).

---

## 2. Lists, tables, queues

Every page that renders a collection:

| Page | Default columns | Sort | Filter | Group | Search | Loading state | Empty state | Pagination |
| ---- | --------------- | ---- | ------ | ----- | ------ | ------------- | ----------- | ---------- |
| Orders | ID, Channel, Customer, Items, Status, Created | none | tab (All / Pack Queue) | no | no | yes ([useDataState](src/hooks/useDataState.tsx)) | yes | none (30 rows) |
| Inventory | varies; QR codes, batches | no | no | no | inline | yes | yes | none |
| Receiving | tracking #, vendor, status | no | no | no | no | yes | yes | none |
| Propagation | kanban columns | no | no | by stage (built-in) | no | yes | yes | none |
| Cultivars | name, family, count, profit | client | no | no | no | yes | yes | none |
| Customers | name, orders, lifetime, last | no | no | no | inline | yes | yes | none |
| Shipping | order, dest, carrier, label | no | no | no | no | yes | yes | none |
| Print Queue | label, recipient | no | no | no | no | yes | yes | none |
| Listings | platform, item, price | no | no | no | no | yes | yes | none |
| Expenses | date, vendor, amount | no | no | no | no | yes | yes | none |
| Supplies | item, qty, threshold | no | no | no | no | yes | yes | none |
| Vendors | name, last order | no | no | no | no | yes | yes | none |
| Tax Report | line items | no | no | no | no | yes | yes | none |
| Licenses | name, status, expires | no | no | no | no | yes | yes | none |
| Audit Log | timestamp, actor, action | no | no | no | inline | yes | yes | none |
| Supplies / Vendors / Listings | similar shape | no | no | no | sometimes | yes | yes | none |

**Existing primitive:** [src/components/ui/DataTable.tsx](src/components/ui/DataTable.tsx) — 82 lines, wraps `@tanstack/react-table` with `getCoreRowModel` only. No sorting, filtering, grouping, selection, column resize, persistence, virtualization, sticky-first-column, header context menu, or filter bar. The visual shell is good (sticky header, hover row); the feature surface is thin.

**Observation:** the codebase already routes loading/empty/error through `useDataState` + [StateRenderer.tsx](src/components/ui/StateRenderer.tsx), which is uniform — good. But the data table itself doesn't accept those states as a prop; pages render them as separate sibling blocks. New primitive must own the loading/empty/error states.

**Bespoke list-like components found:**
- Propagation kanban — legitimate, not a table.
- Receiving cards — could be a grouped table.
- CustomerThread message list — record-detail content, not a list view.
- TasksPanel and NotificationCenter — popover lists, scoped to UI chrome.

---

## 3. Records

| Record type | Where it lives | Open as | Actions location |
| ----------- | -------------- | -------- | ---------------- |
| Order | `/orders/:id` (synthetic, via `globalOrderViewId` in [AppContext.tsx:82](src/contexts/AppContext.tsx:82)) | inline panel in Orders.tsx — **no deep link** | scattered buttons in the row + a "pack" wizard ([Orders.tsx:53](src/pages/Orders.tsx:53)) |
| Customer | `/customers/:id/thread` | **full page route** (CustomerThread.tsx) | header buttons + reply input |
| Inventory item | none — row dead-ends | — | dropdown on row |
| Mortality | `/inventory/:id/mortality` | full page | inline buttons |
| Cultivar | none | — | row click goes nowhere |
| License | none | — | inline expand on Licenses page |
| Vendor | none | — | row click → modal |
| Expense | none | — | row click → modal |
| Agent run | doesn't exist yet | — | — |
| Bug report | doesn't exist yet | — | — |

**Pattern drift:**
- Three different open-strategies (deep-linked route, synthetic-id overlay, modal). Spec calls for one drawer.
- Orders has a special "PackWizard" that's a multi-step modal — legitimate, but should slot into the drawer's tab body.
- Inline editing exists in **zero** places.
- Action surfaces are inconsistent: Orders puts them in row buttons, Customers in the header, Vendors in a modal footer.

---

## 4. Motion + polish

### Durations in the wild

Grep of `duration-` and `transition-` across `src/`:

| Token | Where | Count |
| ----- | ----- | ----- |
| `--default-transition-duration: 150ms` in [index.css:22](src/index.css:22) | global default | — |
| `transition-colors` | everywhere (~250×) | inherits 150ms |
| `duration-200` | mobile More sheet, Toasts | 4× |
| `duration-150` | CommandPalette ([CommandPalette.tsx:52,60](src/components/ui/CommandPalette.tsx:52)) | 2× |

### Easing

- Global default: `cubic-bezier(0, 0, 0.2, 1)` ([index.css:23](src/index.css:23)) — "ease-out".
- No exit easing defined; framer-motion defaults are used implicitly.
- No `prefers-reduced-motion` handling.

### Focus

- `:focus-visible` rule in [index.css:41-44](src/index.css:41) sets a brand-color 2px outline with 2px offset. **Correct**, but only applies at the global level — components with `focus:outline-none` (e.g. [Input.tsx:11](src/components/ui/Input.tsx:11)) opt out and replace the ring with their own `focus:ring-1`. Inconsistent.

### Tooltips, icon labels

- No tooltip primitive. Icon-only buttons in [Layout.tsx](src/components/Layout.tsx) (notification bell, tasks, avatar) have no `aria-label`. Verifiable failure for screen readers.

### Shadows in use

- `shadow-sm`, `shadow-2xl`, `shadow-inner`, three arbitrary brand-glow shadows. Spec calls for **two** values total (`subtle`, `popover`). Significant trim.

### Error handling

- Async errors surface via `useDataState` + `<ErrorState />` block — **page-level only**. No inline (field) errors, no toast-with-retry for async actions, no banner pattern for system-down state.

### Accessibility quick check

- Modals: `<NotificationCenter>`, `<TasksPanel>`, `<KeyboardReference>`, `<CommandPalette>` — none have `role="dialog"` or `aria-labelledby`.
- Live regions: toasts container has no `aria-live`.
- Color-only status: status dots have a label next to them ✓.
- Keyboard traps: no focus trap inside any of the four modals.
- Tab order: not yet audited.

---

## Summary — what's broken

1. **No workspace switcher** (spec requires one for future multi-tenant — Rosette/AEDA/CE).
2. **Topbar carries global search**; should carry contextual actions only.
3. **Palette has hardcoded items**; needs a registry it pulls from so adding a route doesn't mean editing the palette.
4. **No focus trap** anywhere.
5. **DataTable is a primitive shell** without the features every list needs.
6. **Three different record-open patterns** in use; should be one drawer.
7. **No inline editing** on any record.
8. **No tooltip primitive** for icon-only buttons.
9. **No `prefers-reduced-motion` respect.**
10. **No deep-linking** for Order detail.
