/**
 * Motion tokens — the only place durations and easings are defined.
 *
 * This is an operations tool. No bouncy springs, no overshoot. Motion exists
 * to communicate "something changed" within a frame budget — not to delight.
 *
 * If you find yourself reaching for a duration outside this file, the answer
 * is almost always to use one of the existing tokens.
 */

export const duration = {
  hover: 120,    // hover/focus surface change
  state: 160,    // toggle, expand, color shift
  enter: 200,    // entrance (toasts, popovers, fade-in)
  drawer: 240,   // right-drawer slide
} as const;

export const easing = {
  /** Material-style decelerate. Use for everything coming IN. */
  enter: 'cubic-bezier(0.2, 0, 0, 1)',
  /** Accelerate. Use for everything going OUT. */
  exit:  'cubic-bezier(0.4, 0, 1, 1)',
  /** For state changes that aren't directional (toggles, hovers). */
  standard: 'cubic-bezier(0.2, 0, 0.2, 1)',
} as const;

/** Convenience: `transition: ${transition('state')}` → `all 160ms cubic-bezier(...)`. */
export function transition(token: keyof typeof duration, property = 'all') {
  return `${property} ${duration[token]}ms ${easing.standard}`;
}

/** For framer-motion `transition={fmTransition('enter')}` */
export function fmTransition(token: keyof typeof duration, kind: 'enter' | 'exit' | 'standard' = 'standard') {
  return {
    duration: duration[token] / 1000,
    ease: kind === 'enter' ? [0.2, 0, 0, 1] : kind === 'exit' ? [0.4, 0, 1, 1] : [0.2, 0, 0.2, 1],
  } as const;
}

/**
 * Runtime check for prefers-reduced-motion.
 * Components should gate non-essential animations on this.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Tailwind-friendly class strings. These are the only `duration-*` and
 * `ease-*` you should see in components.
 */
export const motionClass = {
  hover: 'duration-[120ms] ease-[cubic-bezier(0.2,0,0.2,1)]',
  state: 'duration-[160ms] ease-[cubic-bezier(0.2,0,0.2,1)]',
  enter: 'duration-[200ms] ease-[cubic-bezier(0.2,0,0,1)]',
  drawer:'duration-[240ms] ease-[cubic-bezier(0.2,0,0,1)]',
} as const;
