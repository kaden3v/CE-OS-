#!/usr/bin/env node
/**
 * Design-token lint — blocks raw hex colors, raw arbitrary font sizes, and raw
 * transition durations outside `src/components/nav/CommandPalette.tsx` (the
 * "signature dark palette" pattern is intentionally hex-coded).
 *
 * Run locally:    node scripts/lint-design-tokens.mjs
 * Run in CI:      add `node scripts/lint-design-tokens.mjs` to your test step
 * Pre-commit:     `cd $(git rev-parse --show-toplevel) && node scripts/lint-design-tokens.mjs`
 *
 * Exit codes:
 *   0  no violations
 *   1  violations found
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');

// Files/dirs to ignore for specific rule families.
const ALLOW = {
  hex: new Set([
    'src/components/nav/CommandPalette.tsx',          // signature dark palette
    'src/lib/nav/registry.ts',                         // workspace swatches
    'src/components/nav/Sidebar.tsx',                  // brand cream text on workspace swatch
  ]),
  // tokens.ts/motion.ts are token definitions — primitives ARE allowed.
  tokenDefs: new Set([
    'design/tokens.ts',
    'design/motion.ts',
  ]),
};

const PATTERNS = [
  {
    id: 'raw-hex',
    re: /#[0-9a-fA-F]{3}\b(?![0-9a-fA-F])|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{8}\b/g,
    message: 'Raw hex color. Use a token from src/index.css `@theme` (e.g. `text-text-primary`) or add a new semantic token in design/tokens.ts.',
    appliesTo: (rel) => !ALLOW.hex.has(rel) && !ALLOW.tokenDefs.has(rel),
  },
  {
    id: 'raw-rgba',
    re: /\brgba?\(\s*\d+\s*,/g,
    message: 'Raw rgba() value. Use an alpha-aware semantic token (border.subtle, surface.raised, etc.).',
    appliesTo: (rel) => !ALLOW.tokenDefs.has(rel) && rel !== 'src/index.css',
  },
  {
    id: 'off-scale-text-size',
    re: /\btext-\[(\d+)px\]/g,
    message: 'Off-scale font size. Valid scale: 11, 12, 13, 14, 16, 18, 22, 28, 36 (see design/tokens.ts font.size).',
    appliesTo: () => true,
    // Allow values that match the design-token scale.
    skipMatch: (m) => {
      const px = Number(m.match(/\d+/)?.[0]);
      return [11, 12, 13, 14, 16, 18, 22, 28, 36].includes(px);
    },
  },
  {
    id: 'arbitrary-duration',
    re: /\bduration-\[?\d+(?:\.\d+)?m?s\]?/g,
    message: 'Arbitrary duration. Use a motion token (design/motion.ts): hover (120ms), state (160ms), enter (200ms), drawer (240ms). Reference via motionClass.* or transition() helper.',
    appliesTo: (rel) => !ALLOW.tokenDefs.has(rel),
    // Allow the four exact ms values that match motion tokens.
    skipMatch: (m) => /\b(120|160|200|240)m?s\b/.test(m),
  },
  {
    id: 'arbitrary-shadow',
    re: /\bshadow-\[[^\]]+\]/g,
    message: 'Arbitrary shadow. The system has two shadow scales: shadow.subtle and shadow.popover (see design/tokens.ts).',
    appliesTo: () => true,
  },
  {
    id: 'off-scale-radius',
    re: /\brounded-(2xl|3xl|none)\b/g,
    message: 'Off-scale radius. Valid: rounded (4), rounded-md (6), rounded-lg (8), rounded-xl (12), rounded-full (pill).',
    appliesTo: () => true,
  },
];

const EXT = /\.(tsx?|css)$/;
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.cache']);

const violations = [];
walk(SRC, (file) => check(file));
// Also check index.css for non-theme raw values
const indexCss = join(SRC, 'index.css');
try { statSync(indexCss); check(indexCss); } catch { /* */ }

if (violations.length === 0) {
  console.log('✓ design-token lint passed (no violations)');
  process.exit(0);
}

const byFile = new Map();
for (const v of violations) {
  if (!byFile.has(v.file)) byFile.set(v.file, []);
  byFile.get(v.file).push(v);
}

console.error(`✗ design-token lint failed — ${violations.length} violation${violations.length === 1 ? '' : 's'} across ${byFile.size} file${byFile.size === 1 ? '' : 's'}\n`);

for (const [file, list] of byFile) {
  console.error(`  ${file}`);
  for (const v of list) {
    console.error(`    ${v.line}:${v.col}  [${v.id}]  ${truncate(v.match, 60)}`);
    console.error(`         ${v.message}`);
  }
  console.error('');
}

process.exit(1);

// ─────────────────────────────────────────────────────────────────────────────
function walk(dir, onFile) {
  let entries;
  try { entries = readdirSync(dir); } catch { return; }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    let s; try { s = statSync(full); } catch { continue; }
    if (s.isDirectory()) walk(full, onFile);
    else if (EXT.test(name)) onFile(full);
  }
}

function check(file) {
  const rel = relative(ROOT, file).split(sep).join('/');
  const text = readFileSync(file, 'utf8');
  const lines = text.split('\n');
  for (const pat of PATTERNS) {
    if (!pat.appliesTo(rel)) continue;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      pat.re.lastIndex = 0;
      let m;
      while ((m = pat.re.exec(line)) !== null) {
        if (pat.skipMatch && pat.skipMatch(m[0])) continue;
        violations.push({
          file: rel,
          line: i + 1,
          col: m.index + 1,
          id: pat.id,
          match: m[0],
          message: pat.message,
        });
      }
    }
  }
}

function truncate(s, n) { return s.length > n ? s.slice(0, n - 1) + '…' : s; }
