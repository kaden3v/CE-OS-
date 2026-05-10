# Accessibility Audit — CE OS shell rebuild

What was checked, what was found, what was fixed, what's still open. Findings here cover the new shell, DataTable, and RecordDrawer; existing pages outside that surface still need their own pass.

Tooling used (or recommended for follow-up): axe-core, Lighthouse a11y, VoiceOver, keyboard-only walkthrough.

---

## Tier 1 — fixed in this rebuild

### Modal/dialog semantics
**Before:** `<NotificationCenter>`, `<TasksPanel>`, `<KeyboardReference>`, `<CommandPalette>` rendered as plain divs.
**After:** every overlay sets `role="dialog"`, `aria-modal="true"`, and `aria-labelledby` pointing at the visible heading. Files: [CommandPalette.tsx](../src/components/nav/CommandPalette.tsx), [ShortcutOverlay.tsx](../src/components/nav/ShortcutOverlay.tsx), [RecordDrawer.tsx](../src/components/record/RecordDrawer.tsx), [ConfirmModal.tsx](../src/components/record/ConfirmModal.tsx).

### Focus traps
**Before:** none of the modals trapped Tab. Focus escaped to background controls.
**After:** [`useFocusTrap`](../src/hooks/useFocusTrap.ts) hook used by drawer, palette, shortcut overlay, and confirm modal. On open, focus moves to the first focusable; Tab/Shift+Tab cycle within; on close, focus returns to the trigger element.

### Live regions for toasts
**Before:** toasts rendered in a div with no `aria-live`.
**After:** [Toaster.tsx](../src/components/ui/Toaster.tsx) splits into two regions — polite for `ok/info/warn` and assertive for `alert` — with proper `role="status"` / `role="alert"` on individual items.

### Icon-only button labels
**Before:** notification bell, tasks toggle, sidebar collapse button, and avatar all had no accessible name.
**After:** every icon-only button now has `aria-label` and a [`<Tooltip>`](../src/components/ui/Tooltip.tsx) that also displays the label on hover/focus. The tooltip primitive itself is keyboard-accessible (shows on focus).

### Focus-visible respect
**Before:** [Input.tsx](../src/components/ui/Input.tsx) and other components opted out of the global `:focus-visible` ring with `focus:outline-none`.
**After:** new components rely on the global rule in [index.css:41](../src/index.css:41) (2px ring, 2px offset, `border.focus` color). When a component needs a custom focus treatment it overrides only the color and never the width/offset (the focus-ring contract from [tokens.ts](./tokens.ts)).

### Tab order
**Before:** no `tabindex` audit. Sidebar Recent items skipped focus order in places.
**After:** every interactive element in the new shell renders as a native button/link with no `tabindex > 0`. The DataTable container is a single tab stop (`tabIndex={0}`); row navigation is arrow-keys. This matches Linear's pattern and keeps Tab predictable.

### Color contrast
**Before:** `text-text-tertiary` (`#5C6066`) used on dark backgrounds was 4.4:1 — just under WCAG AA.
**After:** [`design/tokens.ts`](./tokens.ts) defines `text.tertiary` with both light and dark values tuned to ≥4.5:1 against `surface.base`. Sweep across components pending — done for new shell components, follow-up for existing pages.

### Reduced motion
**Before:** no respect for `prefers-reduced-motion`.
**After:** [`design/motion.ts`](./motion.ts) exposes `prefersReducedMotion()`. The drawer/palette/overlay still animate, but durations should be gated on this. Recommend adding a global CSS rule:
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 1ms !important; transition-duration: 1ms !important; }
}
```
That rule is not yet in `index.css` — quick follow-up.

---

## Tier 2 — fixed structurally, needs sweep across existing pages

These were addressed in the new primitives; existing pages need to migrate to benefit:

| Issue | Fixed in | Still affects |
| ----- | -------- | ------------- |
| Placeholder-as-label | new `<Input>` wrapper (TBD) | most form fields in Settings, Receiving |
| Status conveyed by color only | DataTable status cells (dot + label) | inline badges in Cultivars, Vendors |
| Modal without focus trap | new pattern via `useFocusTrap` | existing PackWizard modal in Orders |
| No skip-link to main content | `main` has `id="main-content"` in [Layout.tsx](../src/components/Layout.tsx) | needs a `<a href="#main-content">Skip to content</a>` at the top of the body |

---

## Tier 3 — open, not yet addressed

### Lighthouse / axe runs
Haven't been executed yet. To run:
```sh
npm run dev
# in another shell:
npx lighthouse http://localhost:3000 --only-categories=accessibility --view
npx @axe-core/cli http://localhost:3000
```
Both should be wired into CI alongside the token lint rule.

### Screen-reader walkthrough
Not yet run. Representative task: triage a bug report → approve a feature → check inventory. Procedure:
1. Enable VoiceOver (⌘F5 on macOS).
2. Open the app, navigate from sidebar → Orders → first row.
3. Note any awkward narration (over-reading, missing labels, focus loss after action).
4. File each finding here.

### Form-field association
Inputs in the new shell use `aria-label` where there's no visible label and `<label>` association where there is. Existing pages (Settings, Receiving, Expenses) have not been audited — many use placeholder-only fields.

### Tables and the `<table>` role
DataTable renders as a real `<table>` with `<thead>`, `<th scope="col">`, `aria-sort`. Row `aria-selected` is set when selected. **Not yet wired:** `aria-rowcount` / `aria-rowindex` for virtualized rows. Required for screen readers to announce "row 47 of 10,000."

### High-contrast / forced-colors mode
Untested. Likely fine because the system avoids color-only signals, but the brand and status tokens should be inspected under `forced-colors: active`.

### Drawer is `aria-modal="false"`
[RecordDrawer.tsx](../src/components/record/RecordDrawer.tsx:67) sets `aria-modal="false"` deliberately — the drawer overlays but doesn't block background, matching Linear's behavior. Trade-off: screen readers may not announce the drawer as a strict modal. If this proves wrong in SR testing, flip to `true` and accept the heavier "you are in a modal" announcement.

---

## Verification checklist (rerun before each release)

- [ ] Lighthouse Accessibility ≥ 95 on three representative pages (Dashboard, Orders list, Order detail with drawer open).
- [ ] axe-core CLI: zero violations.
- [ ] Keyboard-only walkthrough — complete the representative task without touching the mouse.
- [ ] Screen reader (VoiceOver or NVDA) — same task, document any awkward narration.
- [ ] `prefers-reduced-motion` test — toggle in OS settings, confirm transitions reduce to ≤1ms.
- [ ] Color-contrast scan — every text-on-surface pairing ≥4.5:1 in both light and dark mode.
- [ ] Tab order — Tab through the shell + Orders page; order matches visual top-to-bottom, left-to-right.
- [ ] Modal focus return — open drawer → action → close → focus on triggering row.
