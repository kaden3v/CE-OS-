# Content Security Policy (CE-OS)

Canonical policy is delivered as the **`Content-Security-Policy` HTTP header** from Vercel (`vercel.json`). The `<meta http-equiv="Content-Security-Policy">` in `index.html` is a **fallback for local static opens** (e.g. `file://` or servers that do not inject headers). Meta CSP is weaker: **`frame-ancestors` is ignored** in meta tags, and there is no `Content-Security-Policy-Report-Only` equivalent in meta.

Directive-by-directive notes (every non-default loosening needs a reason):

| Directive | Value | Why |
|-----------|--------|-----|
| `default-src` | `'self'` | Baseline: only same-origin unless overridden below. |
| `script-src` | `'self'` | Bundled Vite/React scripts only. No `'unsafe-inline'` — Tailwind v4 here does **not** emit runtime inline `<script>`; verify after upgrades (see below). |
| `style-src` | `'self' 'unsafe-inline' https://fonts.googleapis.com` | **`'unsafe-inline'`** — Tailwind v4 injects many inline styles at runtime; blocking them breaks layout. **`fonts.googleapis.com`** — `@import` of Google Fonts CSS in `src/index.css`. |
| `font-src` | `'self' https://fonts.gstatic.com` | Font files referenced by the Google Fonts stylesheet. |
| `img-src` | `'self' data: blob: https:` | **`https:`** — allows HTTPS images from any host (e.g. future product/CDN URLs). **Security note:** a bare `https:` source also allows an XSS to load `https://attacker.com/...` as an image beacon and exfiltrate data in the query string (for data not protected by `connect-src`). Tighten to explicit host allowlists when you can. **`data:` / `blob:`** — inline previews and canvas flows. |
| `connect-src` | `'self' https://generativelanguage.googleapis.com https://*.supabase.co wss://*.supabase.co` | **`generativelanguage.googleapis.com`** — Gemini (`src/pages/Cultivars.tsx`). **`*.supabase.co` / `wss://*.supabase.co`** — Supabase Auth (and Realtime if enabled) via `src/lib/auth.ts`. |
| `frame-ancestors` | `'none'` | Clickjacking protection (header only; ignored in meta CSP). |
| `base-uri` | `'self'` | Restricts `<base href>` abuse. |
| `form-action` | `'self'` | Form posts stay same-origin. |
| `object-src` | `'none'` | Disables Flash/plugin vectors. |

## If `script-src` needs `'unsafe-inline'` (avoid if possible)

Prefer **nonces or hashes**:

- **Nonce**: server (or Vercel Edge) generates a per-request nonce, sets `Content-Security-Policy: script-src 'nonce-…'`, and adds the same nonce to each allowed `<script>`. Vite/webpack can be configured to emit nonce attributes on injected scripts. **Tradeoff**: requires dynamic HTML or middleware; static hosting alone cannot rotate nonces per request unless you use SSR/edge.

- **Hash**: allow `'sha256-…'` for one known inline script block. **Tradeoff**: any edit to that script changes the hash; brittle for inline helpers.

**Tradeoff of `'unsafe-inline'` on scripts**: any XSS that can inject a `<script>` runs unblocked by CSP script rules — only use if a dependency truly requires inline scripts and nonce/hash is infeasible.

## connect-src audit (from `src/`)

Sources discovered:

1. **`https://generativelanguage.googleapis.com`** — `GoogleGenAI` from `@google/genai` (default API-key base URL in the SDK) when calling Gemini from `src/pages/Cultivars.tsx`.

2. **Stylesheet fetch to `https://fonts.googleapis.com`** — driven by `src/index.css` `@import url('https://fonts.googleapis.com/...')`. This is governed by **`style-src`**, not `connect-src` (no `connect-src` entry required for that URL).

3. **Supabase** — `src/lib/auth.ts` calls `https://<project>.supabase.co` for Auth REST and may use `wss://<project>.supabase.co` if Realtime is enabled later.

## Deploy test plan (Vercel preview)

1. Deploy a preview; open DevTools → **Console** and **Issues**.
2. Navigate each app route; trigger UI that loads data and **Cultivars → care-notes draft** (exercises Gemini `connect-src`).
3. For each CSP console error, record the **blocked URI** and **directive**.
4. Apply the **minimum** fix (often one new host in `connect-src` or `style-src`/`font-src`), document it in this file, then update `vercel.json` and the meta fallback in `index.html`.

Do not widen `connect-src` to wildcards (e.g. `https:`) unless strictly necessary.
