# Canyon Exotics OS — Design Audit (Pre-Tokenization)

Snapshot of every distinct color, type, spacing, radius, shadow, and density value used across `src/` before the design-token migration. Read with `tokens.ts` and `MIGRATION.md`.

**Scope:** 47 `.tsx` files, ~1,686 `className` declarations.
**Stack:** Tailwind v4 with a `@theme` block in [src/index.css](src/index.css). Most components already consume semantic Tailwind tokens (`bg-bg-base`, `text-text-secondary`, etc.) — the audit's job is to find the places that **didn't**.

---

## 1. Colors

### 1a. Theme-defined CSS variables (the intended surface)

Defined in [src/index.css:4-19](src/index.css:4):

| Token                       | Value                       | Tailwind class root |
| --------------------------- | --------------------------- | ------------------- |
| `--color-bg-base`           | `#0E0F11`                   | `bg-bg-base`        |
| `--color-bg-elevated`       | `rgba(255,255,255,0.04)`    | `bg-bg-elevated`    |
| `--color-bg-hover`          | `rgba(255,255,255,0.06)`    | `bg-bg-hover`       |
| `--color-bg-active`         | `rgba(255,255,255,0.08)`    | `bg-bg-active`      |
| `--color-border-subtle`     | `rgba(255,255,255,0.06)`    | `border-border-subtle` |
| `--color-border-strong`     | `rgba(255,255,255,0.12)`    | `border-border-strong` |
| `--color-text-primary`      | `#E8E9EA`                   | `text-text-primary` |
| `--color-text-secondary`    | `#9CA0A6`                   | `text-text-secondary` |
| `--color-text-tertiary`     | `#5C6066`                   | `text-text-tertiary` |
| `--color-accent-brand`      | `#7AB892` (green)           | `bg-accent-brand`   |
| `--color-accent-brand-dim`  | `rgba(122,184,146,0.15)`    | `bg-accent-brand-dim` |
| `--color-status-ok`         | `#7AB892`                   | `bg-status-ok`      |
| `--color-status-warn`       | `#E0B95C`                   | `bg-status-warn`    |
| `--color-status-alert`      | `#D97366`                   | `bg-status-alert`   |
| `--color-status-info`       | `#7CA8C9`                   | `bg-status-info`    |

**Issue:** `status-ok` is literally `accent-brand`. The spec requires these to diverge — status is utility (green-the-color), brand is identity.

### 1b. Semantic class adoption (good — most of the codebase)

| Class | Usages |
| ----- | ------ |
| `text-text-secondary` | 314 |
| `border-border-subtle` | 188 |
| `text-text-primary` | 139 |
| `text-text-tertiary` | 89 |
| `bg-bg-active` | 78 |
| `bg-bg-base` | 71 |
| `bg-bg-elevated` | 59 |
| `bg-bg-hover` | 59 |
| `border-border-strong` | 55 |
| `bg-accent-brand` | 22 |
| `text-status-alert` | 21 |
| `text-accent-brand` | 15 |
| `text-status-ok` | 13 |

These already consume tokens. They'll re-map mechanically.

### 1c. Hardcoded hex codes (drift)

| Hex | Location | Note |
| --- | -------- | ---- |
| `#0E0F11` | [Layout.tsx:364](src/components/Layout.tsx:364), [CommandPalette.tsx:53](src/components/ui/CommandPalette.tsx:53), [KeyboardReference.tsx:76](src/components/ui/KeyboardReference.tsx:76), [Dialog.tsx:26](src/components/ui/Dialog.tsx:26) | `bg-bg-base` already exists — pure drift |
| `#f8f9fa` | [CustomerThread.tsx:137](src/pages/CustomerThread.tsx:137) | **Light-mode background**, breaks dark theme |
| `#1a1a1a` | [CustomerThread.tsx:137,158,170](src/pages/CustomerThread.tsx:137) | **Light-mode text**, used 3× |
| `#e5e7eb` | [CustomerThread.tsx:138,148,159](src/pages/CustomerThread.tsx:138) | Tailwind gray-200, light-mode border |
| `#6b7280`, `#4b5563`, `#9ca3af` | [CustomerThread.tsx:151,167,169,170](src/pages/CustomerThread.tsx:151) | Tailwind gray-500/600/400 |
| `#0D0D0D`, `#A0A0A0` | [AuditLog.tsx:227-228](src/pages/AuditLog.tsx:227) | Inline `style={}` blocks |
| `#C2714F`, `#8A9A5B`, `#4A5D23`, `#2C3518` | [Dashboard.tsx:25](src/pages/Dashboard.tsx:25) | Chart palette, undocumented |
| `#1284` | [Layout.tsx:242](src/components/Layout.tsx:242) | (Likely substring inside a URL/SVG, low concern) |

### 1d. Hardcoded rgba (drift)

| Value | Occurrences | Where |
| ----- | ----------- | ----- |
| `rgba(255,255,255,0.04)` | 6 | Inventory, Cultivars, AuditLog, Customers, Listings, Orders, Propagation, Receiving — **all duplicate `--color-bg-elevated`** |
| `rgba(255,255,255,0.02)` | 5 | Inventory, Customers, Propagation — **no token exists for this** (should be `surface.sunken`) |
| `rgba(255,255,255,0.06)` | 3 | Toasts, Dialog, Customers — **duplicate `--color-border-subtle` / `--color-bg-hover`** |
| `rgba(194,113,79,0.25)`, `rgba(194,113,79,0.2)`, `rgba(194,113,79,0.15)` | 3 | [Orders.tsx:318](src/pages/Orders.tsx:318), [CustomerThread.tsx:167](src/pages/CustomerThread.tsx:167) | Orange brand-glow effect, **not** the active brand color |
| `rgba(0,0,0,0.2)` | 1 | [Licenses.tsx:309](src/pages/Licenses.tsx:309) | Inner shadow |

---

## 2. Typography

### 2a. Font family

- `--font-sans` in [index.css:21](src/index.css:21) → `"Inter", ui-sans-serif, system-ui, sans-serif`. Inter is loaded from Google Fonts on line 1.
- `font-mono` used 23× — Tailwind default (`ui-monospace`).
- `font-serif` used 1× at [CustomerThread.tsx](src/pages/CustomerThread.tsx) — orphaned.
- **No Playfair, no DM Sans in the OS.** The spec calls for DM Sans; Inter must be replaced.

### 2b. Font sizes

| Class | Computed | Usages |
| ----- | -------- | ------ |
| `text-sm` | 14px | ~280 |
| `text-xs` | 12px | ~180 |
| `text-2xl` | 24px | ~40 |
| `text-lg` | 18px | ~30 |
| `text-xl` | 20px | ~15 |
| `text-base` | 16px | 3 |
| `text-4xl` | 36px | 1 ([StatTile.tsx](src/components/ui/StatTile.tsx)) |
| `text-[10px]` | 10px | **26 usages** across 10 files — Layout, Cultivars, Inventory, CustomerThread, Settings, Orders, Shipping, QrGenerator, Licenses, NotificationCenter, Badge |
| `text-[9px]` | 9px | [Orders.tsx](src/pages/Orders.tsx) — sub-scale |
| `text-[12px]` | 12px | [StateRenderer.tsx](src/components/ui/StateRenderer.tsx), [DataTable.tsx](src/components/ui/DataTable.tsx) — duplicates `text-xs` |

**Drift:** `text-[10px]` (26×) and `text-[9px]` (1×) are below the lowest Tailwind step. The new scale standardizes at 11px as the floor.

### 2c. Font weight

Only three weights in use across the codebase: `font-medium` (~150), `font-semibold` (~40), `font-bold` (1× at [Licenses.tsx](src/pages/Licenses.tsx)), `font-normal` (1× at [Orders.tsx](src/pages/Orders.tsx)). **Good adoption already** — bold is the one outlier to retire.

### 2d. Line-height

- `leading-tight` (1.25) — 6×
- `leading-relaxed` (1.625) — 2×
- `leading-none` (1) — 1×

No explicit `leading-normal` (1.5). UI line-height is implicit. New system standardizes to 1.4 (UI) and 1.6 (prose).

### 2e. Letter-spacing

- `tracking-wider` (0.05em) — ~50× — for uppercase eyebrow labels
- `tracking-wide` (0.025em) — ~25×
- `tracking-widest` (0.1em) — 1× ([Dashboard.tsx](src/pages/Dashboard.tsx))
- `tracking-tight` (-0.025em) — 1× ([Layout.tsx](src/components/Layout.tsx))

---

## 3. Spacing

### 3a. Standard scale usage
Tailwind 4px-base spacing classes (`p-1`, `gap-3`, `mt-4`, etc.) are used extensively and conform.

### 3b. Arbitrary spacing values (drift)

| Value | Where | Note |
| ----- | ----- | ---- |
| `pr-[480px]` | 8 pages — AuditLog, Cultivars, Customers, Inventory, Listings, Orders, Propagation, Receiving | Right-rail offset for a 480px drawer. Off-scale but legitimate as a layout constant. |
| `mb-[1px]` | Shipping (3×), Orders (2×), AuditLog (2×) | Hairline correction inside table rows |
| `pt-[15vh]` | [CommandPalette.tsx](src/components/ui/CommandPalette.tsx) | Modal offset |

These are the only arbitrary spacing values in the codebase — the 4px scale is overwhelmingly respected. `pr-[480px]` should be canonicalized as a layout constant (`drawer.width = 480`), not a spacing token.

---

## 4. Border radius

| Class | Tailwind value | Usages |
| ----- | -------------- | ------ |
| `rounded` | 4px | ~60 |
| `rounded-md` | 6px | ~25 |
| `rounded-lg` | 8px | ~70 |
| `rounded-xl` | 12px | ~15 |
| `rounded-2xl` | 16px | 3 ([CustomerThread.tsx](src/pages/CustomerThread.tsx)) — **outside the new {4,6,8,12} scale** |
| `rounded-full` | 9999px | ~50 (pills, avatars) |
| `rounded-l` | 4px left-only | 4× |
| `rounded-[8px]` | 8px (arbitrary) | [Button.tsx:28](src/components/ui/Button.tsx:28), [Input.tsx:11](src/components/ui/Input.tsx:11) |
| `rounded-[12px]` | 12px (arbitrary) | [Card.tsx:12](src/components/ui/Card.tsx:12) |

**Drift:** arbitrary `rounded-[Xpx]` on the three core primitives (Button, Input, Card). They should be `rounded-lg` / `rounded-xl`. `rounded-2xl` (16px) is outside the new scale and must be downgraded.

---

## 5. Shadows

| Class | Usages |
| ----- | ------ |
| `shadow-sm` | ~20 |
| `shadow-2xl` | ~15 (modals, drawers, raised cards) |
| `shadow-inner` | 1× [Licenses.tsx](src/pages/Licenses.tsx) |
| `shadow` | 1× [Orders.tsx](src/pages/Orders.tsx) |
| `shadow-[0_0_20px_rgba(194,113,79,0.25)]` | [Orders.tsx:318](src/pages/Orders.tsx:318) | Orange brand glow — bespoke |
| `shadow-[0_0_15px_rgba(194,113,79,0.15)]` | [Orders.tsx:318](src/pages/Orders.tsx:318) | Same effect, second size |
| `shadow-[0_0_0_2px_rgba(194,113,79,0.2)]` | [CustomerThread.tsx:167](src/pages/CustomerThread.tsx:167) | Focus-ring imitation |

**Drift:** 3 arbitrary shadow values, all using an orange color (`#C2714F`) that **is not in the theme**. Either elevate to a `shadow.glow.brand` token or remove.

---

## 6. Density (heights of interactive elements)

| Element | Current | Spec target |
| ------- | ------- | ----------- |
| Header bar | 56px (`h-14`) in Layout.tsx | — |
| Mobile bottom nav | 64px (`h-16`) in Layout.tsx | — |
| Button — default | `px-4 py-2` → ~36–40px (no explicit `h-`) | 32px |
| Button — `sm` | `px-2 py-2 text-xs` → ~28px | 28px (matches `compact`) |
| Button — `icon` | `p-2` → ~32px | 32px |
| Table row | Implicit, varies by `py-*` per page | 32px |
| Nav item | `h-8` (32px) in [Layout.tsx:319](src/components/Layout.tsx:319) | 32px ✓ |
| List item | varies — `h-12` (48px), `h-10`, `h-8` mixed | 40px |
| Avatar | `h-6`, `h-8`, `h-12` mixed | (component-level, not token) |

**Drift:** button heights are implicit; sizes resolve to roughly 28/32/40 depending on text inside. New tokens make height explicit (`density.button.default = 32`).

---

## Worst offenders (ranked)

1. **`CustomerThread.tsx` "light-mode island"** — 7 hex codes (`#f8f9fa`, `#1a1a1a`, `#e5e7eb`, plus 4 grays) hardcoded in `style={}` blocks at [lines 137–170](src/pages/CustomerThread.tsx:137). This component renders as a light card inside an otherwise dark app. Either it's a deliberate "printed email" surface and needs `surface.inverted` tokens, or it's a bug.
2. **`text-[10px]` proliferation (26 usages, 10 files)** — there's an implicit "micro" type step the codebase needs but Tailwind doesn't have. Tokenize as `font.size[11]` (the new spec floor); raise the 9px occurrence on [Orders.tsx](src/pages/Orders.tsx) to 11px.
3. **`bg-[#0E0F11]` (4 usages)** — every one of these has `bg-bg-base` available. Pure drift, mechanical fix.
4. **`rgba(255,255,255,0.04)` duplicated 6×** — already exists as `--color-bg-elevated`. Drift.
5. **`rgba(255,255,255,0.02)` (5 usages, no token)** — the codebase invented an even-more-subtle surface that the theme doesn't expose. New `surface.sunken` token formalizes this.
6. **Orange `rgba(194,113,79,*)` brand glow** — 3 usages of an orange that **is not the brand color**. Either a legacy palette leak or a deliberate "tan" accent — under the new system it maps to `brand.tan` (#9A7B5B) and uses an explicit glow token.
7. **Button/Input/Card arbitrary radii (`rounded-[8px]`, `rounded-[12px]`)** — the three most-imported primitives in the app. Switch to `rounded-lg` / `rounded-xl`.
8. **Brand mis-identity** — the OS today has a **green** brand (`#7AB892`), but the new Canyon Exotics identity is `#1A2E28` deep-green + `#F5F0E8` cream + `#9A7B5B` tan. The current palette is being retired.
9. **Status/brand collision** — `status-ok` === `accent-brand`. Status must be utility (independent green); brand must be Canyon.
10. **No dark/light duality** — every value is single-mode (dark). `tokens.ts` is now dual-valued.

---

## Tally

- Distinct hex codes outside `tokens.ts`: **17**
- Distinct rgba() values outside `tokens.ts`: **9**
- Arbitrary `text-[Xpx]`: **3** distinct sizes (9, 10, 12)
- Arbitrary `rounded-[Xpx]`: **2** distinct sizes (8, 12)
- Arbitrary `shadow-[…]`: **3**
- Arbitrary spacing: **3** (pr-[480px], mb-[1px], pt-[15vh])
- Off-scale radius classes: **1** (`rounded-2xl` = 16px)
- Off-scale font-weight: **1** (`font-bold`)
