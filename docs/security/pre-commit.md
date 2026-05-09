# Pre-commit security and formatting

This repo uses **Husky** to run **lint-staged** before each commit. Staged files are checked for accidental secrets (**secretlint**), TypeScript/React issues (**eslint** with `--fix`), and formatting (**prettier**).

## Why secretlint (vs detect-secrets)

We standardize on **[secretlint](https://github.com/secretlint/secretlint)** instead of Yelp’s **detect-secrets** because:

- **Node-native workflow** — rules ship as npm packages, share config with the same toolchain as ESLint/Prettier, and run on Windows/macOS/Linux without a Python runtime.
- **Explicit rule configuration** — patterns and allowlists live in `.secretlintrc.json` with predictable JSON options; detect-secrets often relies on baseline files and plugin hooks that are heavier for small TS/React repos.
- **lint-staged integration** — secretlint accepts explicit file paths from lint-staged and respects `.secretlintignore` + `.gitignore` (v13+), which maps cleanly to “scan only what you commit.”

**Trade-off:** For **full Git history** auditing, [gitleaks](https://github.com/gitleaks/gitleaks) (Go binary) still tends to be deeper and faster across all revisions. Run it periodically (see below); do not rely on pre-commit alone for historical leaks.

## What runs on commit

| Step       | Scope              | Command / tool                          |
|-----------|--------------------|-----------------------------------------|
| Secrets   | Staged paths       | `secretlint`                            |
| Lint      | `*.ts`, `*.tsx`    | `eslint --fix --max-warnings 0`        |
| Format    | `*.ts`, `*.tsx`    | `prettier --write`                      |
| Secrets   | Other staged text  | `secretlint` on `*.json`, `*.md`, etc.  |
| Secrets   | Env-shaped files   | `secretlint` on `.env*`                 |

Configuration lives in:

- `.secretlintrc.json` — secret patterns and allowlists  
- `.secretlintignore` — paths secretlint should skip  
- `eslint.config.js` — ESLint flat config  
- `prettier.config.js` — Prettier defaults  
- `package.json` → `lint-staged` — which globs run which tools  
- `.husky/pre-commit` — invokes `lint-staged`  

Manual full-repo scan (optional):

```bash
npm run lint:secrets
```

## Bypassing hooks legitimately (`--no-verify`)

Git cannot enforce policy inside the hook when hooks are skipped; **`--no-verify` bypasses all client hooks**, including secret scanning.

**Team rule:** If you must push with hooks disabled, the commit message must document why, using a dedicated token so reviewers can grep for audits:

```text
SECRETLINT_BYPASS: documented exception — pasting redacted example from vendor ticket #12345 for docs only.
```

Do **not** use `--no-verify` to commit real credentials. Fix the issue or adjust rules / allowlists instead.

## False positives

1. **Allowlist the secret shape** in `.secretlintrc.json` under the pattern rule’s global `"allows"` array (regex strings), or add a targeted `allows` entry on a single pattern block when the rule supports it.
2. **Narrow file scope** — use `filePathGlobs` on a pattern entry so tests or fixtures are excluded from that rule.
3. **Ignore path** — add paths to `.secretlintignore` only for generated/vendor blobs (not for hiding real secrets).

After changing rules, run:

```bash
npm run lint:secrets
```

## Updating secret rules

1. Edit `.secretlintrc.json` — add or adjust entries under `@secretlint/secretlint-rule-pattern` → `options.patterns`.
2. Prefer **specific** prefixes (`sk-proj-`, `shpat_`, …) over ultra-generic `sk-` patterns to reduce noise.
3. Run `npm run lint:secrets` before committing config changes.

**Supabase JWT note:** A JWT’s payload is Base64URL-encoded; the literal substring `service_role` usually **does not** appear in the raw token string. This repo flags **`SUPABASE_SERVICE_ROLE_KEY=eyJ…`**-style lines (JWT-shaped assignment). Decoded-payload checks belong in **gitleaks** / server-side scanners or CI with dedicated Supabase rules.

## One-time / periodic history scan (gitleaks)

Pre-commit only sees the working tree. To scan **history**:

```bash
gitleaks detect -v
```

To scan the working tree without Git metadata:

```bash
gitleaks detect --no-git -v
```

If gitleaks reports a finding, **rotate the credential** and consider removing the secret from history with `git filter-repo` (destructive; coordinate with the team).
