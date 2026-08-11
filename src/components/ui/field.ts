/**
 * One shared look for every form control.
 *
 * Inputs went through the `Input` primitive while raw selects were hand-styled at
 * 43 call sites across 24 files, in 8 different variations. The dominant one
 * used `bg-bg-base` + `border-border-subtle` + `rounded-lg` + `px-3` and a
 * `focus:border-border-strong` focus state — against `Input`'s `bg-bg-elevated`
 * + `border-border-strong` + `rounded-[8px]` + `px-2` and an accent ring. Two
 * controls sitting side by side in the same form did not match each other, in
 * resting state or on focus. This constant is the single source for all three.
 */
export const FIELD_BASE =
  "bg-bg-elevated border border-border-strong rounded-[8px] px-2 py-2 text-sm " +
  "placeholder:text-text-secondary focus:outline-none focus:border-accent-brand " +
  "focus:ring-1 focus:ring-accent-brand transition-colors " +
  "disabled:opacity-50 disabled:cursor-not-allowed";
