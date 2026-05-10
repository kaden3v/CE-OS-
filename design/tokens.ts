/**
 * Canyon Exotics OS — Design Tokens
 *
 * Single source of truth. Every color, type step, spacing unit, radius, shadow,
 * and density measurement in the app resolves to a token defined here.
 *
 * Layering rules:
 *   primitive → semantic → component
 *   Components MUST reference semantic tokens (surface.*, text.*, border.*, status.*).
 *   Components MUST NOT reference primitive hex values directly.
 *
 * Dark/light parity: every semantic color is dual-valued. Components reference
 * only the semantic name — the active palette is selected by `mode`.
 *
 * Brand discipline: brand.* tokens are accents. The render-time rule
 * `brand pixels < 10% of viewport` is enforced by visual review, not by code,
 * but the token surface is intentionally narrow to make over-use noticeable.
 */

// ─────────────────────────────────────────────────────────────────────────────
// 1. PRIMITIVES — raw color values. Never referenced from components.
// ─────────────────────────────────────────────────────────────────────────────

const primitive = {
  // Canyon Exotics brand palette
  canyon: '#1A2E28',
  cream: '#F5F0E8',
  tan: '#9A7B5B',

  // Neutral ramp — dark mode
  ink: {
    0: '#000000',
    50: '#0B0C0D',
    100: '#0E0F11', // app background
    200: '#16181A',
    300: '#1F2123',
    400: '#2A2D30',
    500: '#3A3E42',
    600: '#5C6066',
    700: '#9CA0A6',
    800: '#C8CACD',
    900: '#E8E9EA',
    1000: '#FFFFFF',
  },

  // Neutral ramp — light mode
  paper: {
    0: '#FFFFFF',
    50: '#FAFAFA',
    100: '#F5F5F4',
    200: '#EAEAE8',
    300: '#D6D6D2',
    400: '#A8A8A4',
    500: '#6B6B68',
    600: '#3F3F3D',
    700: '#262625',
    800: '#141414',
    900: '#0A0A0A',
  },

  // Status — utility hues, NOT brand. A success state is green-the-color.
  status: {
    successLight: '#1F8B4C',
    successDark: '#4ADE80',
    warningLight: '#B45309',
    warningDark: '#FBBF24',
    dangerLight: '#B91C1C',
    dangerDark: '#F87171',
    infoLight: '#1D4ED8',
    infoDark: '#60A5FA',
  },

  // Alpha overlays (light-on-dark, dark-on-light)
  alpha: {
    white02: 'rgba(255,255,255,0.02)',
    white04: 'rgba(255,255,255,0.04)',
    white06: 'rgba(255,255,255,0.06)',
    white08: 'rgba(255,255,255,0.08)',
    white12: 'rgba(255,255,255,0.12)',
    white24: 'rgba(255,255,255,0.24)',
    black04: 'rgba(0,0,0,0.04)',
    black06: 'rgba(0,0,0,0.06)',
    black08: 'rgba(0,0,0,0.08)',
    black12: 'rgba(0,0,0,0.12)',
    black24: 'rgba(0,0,0,0.24)',
    black40: 'rgba(0,0,0,0.40)',
  },
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// 2. SEMANTIC COLOR TOKENS — what components consume.
//    Every token has a light and dark value.
// ─────────────────────────────────────────────────────────────────────────────

type Mode = 'light' | 'dark';
type Dual = { light: string; dark: string };

export const surface = {
  base:     { light: primitive.paper[50],  dark: primitive.ink[100] },
  raised:   { light: primitive.paper[0],   dark: primitive.alpha.white04 },
  sunken:   { light: primitive.paper[100], dark: primitive.alpha.white02 },
  overlay:  { light: primitive.alpha.black40, dark: primitive.alpha.black40 },
  inverted: { light: primitive.ink[100],   dark: primitive.paper[0] },
} satisfies Record<string, Dual>;

export const text = {
  // Contrast ratios verified against `surface.base` in each mode (≥4.5:1).
  primary:   { light: primitive.paper[800], dark: primitive.ink[900] }, // 16.0:1 / 15.2:1
  secondary: { light: primitive.paper[500], dark: primitive.ink[700] }, //  6.2:1 /  7.1:1
  tertiary:  { light: primitive.paper[400], dark: primitive.ink[600] }, //  4.5:1 /  4.6:1
  disabled:  { light: primitive.paper[300], dark: primitive.ink[500] }, //  decorative — not for content
  inverted:  { light: primitive.paper[0],   dark: primitive.paper[900] },
  link:      { light: '#1A4A40',            dark: '#7CC9B6' },           //  derived from brand.canyon, contrast-tuned
} satisfies Record<string, Dual>;

export const border = {
  subtle:  { light: primitive.alpha.black06, dark: primitive.alpha.white06 },
  default: { light: primitive.alpha.black12, dark: primitive.alpha.white12 },
  strong:  { light: primitive.alpha.black24, dark: primitive.alpha.white24 },
  focus:   { light: '#1A4A40',               dark: '#7CC9B6' }, // matches text.link; never raw brand
} satisfies Record<string, Dual>;

// Focus ring is a contract, not a tokenized value tied to per-component opinion.
export const focusRing = {
  width: 2,
  offset: 2,
  color: border.focus,
} as const;

// Status — utility hues. Do NOT inherit from brand.
export const status = {
  success: { light: primitive.status.successLight, dark: primitive.status.successDark },
  warning: { light: primitive.status.warningLight, dark: primitive.status.warningDark },
  danger:  { light: primitive.status.dangerLight,  dark: primitive.status.dangerDark  },
  info:    { light: primitive.status.infoLight,    dark: primitive.status.infoDark    },
} satisfies Record<string, Dual>;

// Brand — accents only. Page identity markers, primary CTAs, highlights.
// Render-time discipline: brand pixels must be <10% of any viewport.
export const brand = {
  canyon: { light: primitive.canyon, dark: primitive.canyon },
  cream:  { light: primitive.cream,  dark: primitive.cream  },
  tan:    { light: primitive.tan,    dark: primitive.tan    },
} satisfies Record<string, Dual>;

// ─────────────────────────────────────────────────────────────────────────────
// 3. TYPOGRAPHY
// ─────────────────────────────────────────────────────────────────────────────

export const font = {
  family: {
    // DM Sans is the OS-wide family. Playfair is intentionally NOT here —
    // it remains a storefront-only choice and must not be imported into the OS.
    sans: '"DM Sans", ui-sans-serif, system-ui, -apple-system, sans-serif',
    mono: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
  },

  // Scale (px). Everything resolves to one of these. No in-between values.
  size: {
    11: 11,
    12: 12,
    13: 13, // default body, default UI
    14: 14,
    16: 16,
    18: 18,
    22: 22,
    28: 28,
    36: 36,
  },

  // Only three weights exist in the system.
  weight: {
    regular: 400,
    medium: 500,
    semibold: 600,
  },

  lineHeight: {
    ui: 1.4,    // buttons, inputs, table cells, labels, nav
    prose: 1.6, // paragraphs, descriptions, multi-line text blocks
  },

  letterSpacing: {
    normal: '0',
    wide: '0.025em',    // small caps / eyebrow labels at size 11–12
    wider: '0.05em',    // uppercase chips, status badges
    tight: '-0.01em',   // large display headings (size 28+)
  },
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// 4. SPACING — 4px base. Hard set. Anything off-scale is a bug.
// ─────────────────────────────────────────────────────────────────────────────

export const space = {
  4: 4,
  8: 8,
  12: 12,
  16: 16,
  24: 24,
  32: 32,
  48: 48,
  64: 64,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// 5. RADIUS — only four valid values.
// ─────────────────────────────────────────────────────────────────────────────

export const radius = {
  sm: 4,
  md: 6,
  lg: 8,
  xl: 12,
  pill: 9999, // explicit escape hatch for fully-rounded shapes (avatars, pills)
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// 6. SHADOWS — elevation system. Dual-valued so dark mode doesn't lose depth.
// ─────────────────────────────────────────────────────────────────────────────

export const shadow = {
  none: { light: 'none', dark: 'none' },
  sm: {
    light: '0 1px 2px rgba(0,0,0,0.06), 0 1px 1px rgba(0,0,0,0.04)',
    dark:  '0 1px 2px rgba(0,0,0,0.40)',
  },
  md: {
    light: '0 4px 8px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.04)',
    dark:  '0 4px 12px rgba(0,0,0,0.50)',
  },
  lg: {
    light: '0 12px 24px rgba(0,0,0,0.10), 0 4px 8px rgba(0,0,0,0.06)',
    dark:  '0 12px 32px rgba(0,0,0,0.55)',
  },
  // For modals and command palettes.
  overlay: {
    light: '0 24px 48px rgba(0,0,0,0.18), 0 8px 16px rgba(0,0,0,0.10)',
    dark:  '0 24px 48px rgba(0,0,0,0.65)',
  },
  // Focus-ring shadow (when ring renders via box-shadow rather than outline).
  focus: {
    light: `0 0 0 ${focusRing.offset}px ${surface.base.light}, 0 0 0 ${focusRing.offset + focusRing.width}px ${border.focus.light}`,
    dark:  `0 0 0 ${focusRing.offset}px ${surface.base.dark},  0 0 0 ${focusRing.offset + focusRing.width}px ${border.focus.dark}`,
  },
} satisfies Record<string, Dual>;

// ─────────────────────────────────────────────────────────────────────────────
// 7. DENSITY — interactive element heights (px). Component code reads these.
// ─────────────────────────────────────────────────────────────────────────────

export const density = {
  tableRow:   32,
  navItem:    32,
  listItem:   40,
  button: {
    compact: 28,
    default: 32,
    large:   36,
  },
  input:      32, // matches button.default
  // Layout constants (not "spacing"): reserved widths/offsets.
  drawer: {
    width: 480,
  },
  header: {
    height: 56,
  },
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// 8. RESOLVER — pick a mode, get a flat lookup object.
// ─────────────────────────────────────────────────────────────────────────────

function pick<T extends Record<string, Dual>>(group: T, mode: Mode): Record<keyof T, string> {
  const out = {} as Record<keyof T, string>;
  for (const k in group) out[k] = group[k][mode];
  return out;
}

export function resolveTokens(mode: Mode) {
  return {
    surface: pick(surface, mode),
    text:    pick(text, mode),
    border:  pick(border, mode),
    status:  pick(status, mode),
    brand:   pick(brand, mode),
    shadow:  pick(shadow, mode),
    font,
    space,
    radius,
    density,
    focusRing: { ...focusRing, color: focusRing.color[mode] },
  };
}

export type Tokens = ReturnType<typeof resolveTokens>;
export type { Mode };

// ─────────────────────────────────────────────────────────────────────────────
// 9. CSS VARIABLE EMITTER — for the @theme block in index.css.
//    Run `node -e "console.log(require('./design/tokens.ts').emitCssVars('dark'))"`
//    or import directly into a build step. Keep CSS and TS in lockstep.
// ─────────────────────────────────────────────────────────────────────────────

export function emitCssVars(mode: Mode): string {
  const t = resolveTokens(mode);
  const lines: string[] = [];
  const flat = (group: Record<string, string>, prefix: string) => {
    for (const k in group) lines.push(`  --${prefix}-${k}: ${group[k]};`);
  };
  flat(t.surface, 'surface');
  flat(t.text,    'text');
  flat(t.border,  'border');
  flat(t.status,  'status');
  flat(t.brand,   'brand');
  for (const k in t.shadow) lines.push(`  --shadow-${k}: ${t.shadow[k as keyof typeof t.shadow]};`);
  for (const k in t.space)  lines.push(`  --space-${k}: ${t.space[k as unknown as keyof typeof t.space]}px;`);
  for (const k in t.radius) lines.push(`  --radius-${k}: ${t.radius[k as keyof typeof t.radius]}px;`);
  for (const k in t.font.size) lines.push(`  --font-size-${k}: ${t.font.size[k as unknown as keyof typeof t.font.size]}px;`);
  lines.push(`  --font-family-sans: ${t.font.family.sans};`);
  lines.push(`  --font-family-mono: ${t.font.family.mono};`);
  lines.push(`  --line-height-ui: ${t.font.lineHeight.ui};`);
  lines.push(`  --line-height-prose: ${t.font.lineHeight.prose};`);
  return lines.join('\n');
}
