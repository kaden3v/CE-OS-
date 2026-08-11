import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import jsxA11y from "eslint-plugin-jsx-a11y";

/**
 * The project had no linter at all — `npm run lint` was just `tsc --noEmit`
 * (now `npm run typecheck`). Several defects found in the 2026-08-10 review
 * were things a linter catches for free: unused imports, a button with no
 * onClick, labels not tied to their control. Note `useEntity` already carried
 * `// eslint-disable-next-line react-hooks/exhaustive-deps` comments for a
 * linter that wasn't installed.
 *
 * Rules are set at the level the codebase can actually hold today: correctness
 * rules error, and the stylistic/legacy ones warn so `--max-warnings` can be
 * ratcheted down over time rather than blocking every commit now.
 */
export default tseslint.config(
  {
    ignores: ["dist/**", "coverage/**", "node_modules/**", "src/lib/database.types.ts"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: {
      "react-hooks": reactHooks,
      "jsx-a11y": jsxA11y,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.flatConfigs.recommended.rules,

      // Correctness — these block.
      "no-console": ["error", { allow: ["warn", "error"] }],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],

      // ---- Known debt -------------------------------------------------
      // These all predate the linter and each needs a real refactor, not a
      // mechanical fix. They are warnings so CI can enforce "no new problems"
      // via --max-warnings today instead of demanding a 129-error cleanup
      // before anyone can commit. Ratchet each to "error" as it reaches zero.
      "@typescript-eslint/no-explicit-any": "warn", // now mostly `supabase as any`; the DataTable cell defs are typed
      "react-hooks/exhaustive-deps": "warn",
      "react-hooks/set-state-in-effect": "warn", // 30 — React Compiler rule, flags some legitimate sync
      "react-hooks/static-components": "warn", // 12 — components declared during render
      "react-hooks/refs": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/incompatible-library": "warn",
      // 33 labels the association pass couldn't pair automatically, plus
      // clickable non-interactive elements. Real a11y debt; see T13/F16.
      "jsx-a11y/label-has-associated-control": "warn",
      "jsx-a11y/click-events-have-key-events": "warn",
      "jsx-a11y/no-static-element-interactions": "warn",
      "jsx-a11y/no-noninteractive-element-interactions": "warn",

      "jsx-a11y/no-autofocus": "off", // deliberate on modal/search first fields

      // Four pages build printable HTML in a template literal and write it into
      // a popup. Those literals must contain `<\/script>` — unescaped, the
      // sequence closes the enclosing script block when the popup parses it.
      // The escape is required, not redundant, and an inline disable can't be
      // placed inside a template literal (it would print as page content).
      "no-useless-escape": "off",
    },
  },
  {
    // Tests may reach for `any` freely when building fixtures.
    files: ["**/*.test.{ts,tsx}", "e2e/**/*.ts"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
);
