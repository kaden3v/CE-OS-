# Design Token Migration

Token system lives in [design/tokens.ts](design/tokens.ts). Inventory of what existed before is in [design/audit.md](design/audit.md). This note covers what's changing and what to do when you spot more drift.

## What's changing

### Brand identity (full swap)
- **Old:** green `#7AB892`, dark base `#0E0F11`, mid-grey ramp.
- **New:** Canyon `#1A2E28`, Cream `#F5F0E8`, Tan `#9A7B5B`. These are accent-only — page identity markers, primary CTAs, highlight states. **Brand pixels must stay under 10% of any rendered viewport.**

### Status decoupled from brand
- **Old:** `status-ok` was literally `accent-brand` (`#7AB892`).
- **New:** `status.success` is an independent utility green (`#1F8B4C` / `#4ADE80` dark). Status is "green-the-color," not Canyon green. Don't ever wire `status.*` back to `brand.*`.

### Font family
- **Old:** Inter loaded from Google Fonts.
- **New:** DM Sans is the OS-wide family. **Playfair is forbidden in the OS** — it stays a storefront-only choice.

### Type scale
- **Old:** Tailwind defaults plus 26× `text-[10px]` and a stray `text-[9px]`.
- **New:** explicit scale `11 / 12 / 13 / 14 / 16 / 18 / 22 / 28 / 36`. Default body and UI both 13px. Weights `400 / 500 / 600` only — `font-bold` is retired.

### Spacing, radius
- **Spacing:** `4 / 8 / 12 / 16 / 24 / 32 / 48 / 64`. Anything else is a bug. `pr-[480px]` is reclassified as a layout constant (`density.drawer.width`), not a spacing token.
- **Radius:** `4 / 6 / 8 / 12` plus `pill` (9999). `rounded-2xl` (16px) and arbitrary `rounded-[Xpx]` are out.

### Light + dark from day one
Every semantic token is `{ light, dark }`. Components reference the semantic name only; mode-switching happens at the root via `resolveTokens('light' | 'dark')`. CSS variables are emitted by `emitCssVars(mode)` so [src/index.css](src/index.css)'s `@theme` block stays in lockstep with the TS source of truth.

### Focus ring is a contract
2px width, 2px offset, always. Color comes from `border.focus` (a tuned derivative of `brand.canyon`, contrast-verified against both surfaces). Components must not invent their own focus treatment — three currently do, and they're called out below.

## Patterns replaced

| Before | After |
| ------ | ----- |
| `bg-[#0E0F11]` | `bg-surface-base` |
| `rgba(255,255,255,0.04)` inline | `bg-surface-raised` |
| `rgba(255,255,255,0.02)` inline | `bg-surface-sunken` |
| `rgba(255,255,255,0.06)` inline | `bg-border-subtle` (border) or `bg-surface-raised` (fill) |
| `text-[10px]` | `text-[length:var(--font-size-11)]` (or new `text-micro` utility) |
| `text-[9px]` | promoted to `font.size[11]` — 9px is dropped |
| `text-[12px]` | `text-xs` (already 12px) |
| `rounded-[8px]` | `rounded-lg` |
| `rounded-[12px]` | `rounded-xl` |
| `rounded-2xl` | `rounded-xl` (downgrade) |
| `font-bold` | `font-semibold` |
| `bg-accent-brand` (old green) | `bg-brand-canyon` for identity / `bg-status-ok` for state |
| Inline `style={{ background: '#f8f9fa', color: '#1a1a1a' }}` ([CustomerThread.tsx:137](src/pages/CustomerThread.tsx:137)) | `bg-surface-inverted text-text-inverted` |
| `shadow-[0_0_20px_rgba(194,113,79,0.25)]` ([Orders.tsx:318](src/pages/Orders.tsx:318)) | Either remove or rebuild as a `brand.tan` glow utility — orange `#C2714F` is not in the palette |
| `Button.tsx` `px-4 py-2` (implicit height) | explicit `h-[var(--density-button-default)]` = 32px |

## Files that need touching (priority order)

1. **[src/index.css](src/index.css)** — replace the `@theme` block with output of `emitCssVars('dark')`; add a light-mode `:root[data-theme="light"]` block from `emitCssVars('light')`. Swap the Inter `@import` for DM Sans.
2. **[src/pages/CustomerThread.tsx](src/pages/CustomerThread.tsx)** — 7 hex codes in `style={}` blocks at lines 137–170. Either embrace `surface.inverted` (deliberate light card) or revert to dark tokens.
3. **[src/components/ui/Button.tsx](src/components/ui/Button.tsx:28)**, **[Input.tsx](src/components/ui/Input.tsx:11)**, **[Card.tsx](src/components/ui/Card.tsx:12)** — kill `rounded-[Xpx]`, switch to `rounded-lg` / `rounded-xl`. Add explicit `h-` to Button.
4. **Hardcoded `bg-[#0E0F11]`** at [Layout.tsx:364](src/components/Layout.tsx:364), [CommandPalette.tsx:53](src/components/ui/CommandPalette.tsx:53), [KeyboardReference.tsx:76](src/components/ui/KeyboardReference.tsx:76), [Dialog.tsx:26](src/components/ui/Dialog.tsx:26) → `bg-surface-base`.
5. **`text-[10px]` sweep** — 26 usages across 10 files. Treat as `font.size[11]`.
6. **Inline `rgba(255,255,255,...)`** in Inventory, Customers, Propagation, Orders, Receiving, Listings, Cultivars, AuditLog — replace with surface tokens.
7. **Chart palette** in [Dashboard.tsx:25](src/pages/Dashboard.tsx:25) — four ad-hoc earth-tones. Add a `chart.series.*` token group if charts stay; otherwise route through `brand.tan` + neutrals.

## If you find more drift

The audit caught what existed at migration time. New drift is easiest to catch with these grep checks — fold them into a CI script when ready:

```sh
# Hex codes outside tokens.ts (should return zero)
rg -n '#[0-9a-fA-F]{3,8}\b' src/

# Inline rgba/rgb (should return zero)
rg -n 'rgba?\(' src/

# Off-scale radii
rg -n 'rounded-\[' src/
rg -n 'rounded-(2|3)xl' src/

# Off-scale type
rg -n 'text-\[[0-9]+px\]' src/

# Off-scale shadows
rg -n 'shadow-\[' src/
```

If a check fires:

1. **Is the value already a token?** Replace the literal with the semantic class. 90% of cases.
2. **Is it a new concept?** Add a semantic token (light + dark) in `tokens.ts`, regenerate the CSS variables, then reference it. Never add a primitive to a component.
3. **Is it brand?** Make sure it stays in the <10% viewport budget. If the component is currently brand-heavy (full-page hero, dense brand tinting), step back to the design.
4. **Is it status?** Pick the utility status hue. Resist the temptation to use Canyon green for a "success" affordance — they have different jobs.

## Out-of-scope follow-ups

These are real but separate from the token migration:

- **DM Sans web font loading** — choose self-hosted vs. Google Fonts; add `font-display: swap`.
- **Lighthouse a11y verification** — needs running app + screenshot tooling; spec calls for >95 in both modes.
- **Brand pixel-budget audit** — render 5 screens in both modes, sample, confirm <10% brand coverage. Best done with screenshot diffing once the migration lands.
- **Chart token group** — Recharts series colors aren't covered yet; do it before adding more charts.
