// lint-staged runs this on every `git commit` (via the Husky pre-commit hook).
//
// We type-check the WHOLE project rather than the individual staged files:
// `tsc` cannot type-check a subset of files against tsconfig.json (passing file
// args makes it ignore the config), so the value is a function that returns a
// single project-wide command and ignores lint-staged's file list. The glob
// still gates execution — the check only runs when a .ts/.tsx file is staged.
export default {
  '*.{ts,tsx}': () => 'tsc --noEmit -p tsconfig.json',
};
