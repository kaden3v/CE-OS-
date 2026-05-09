# Manual test — Supabase magic link auth (CE-OS)

## Prerequisites

1. Supabase project with **Auth → Providers → Email** enabled (magic link / OTP).
2. **Auth → URL configuration**: set **Site URL** to your deploy URL (e.g. `https://ce-os.vercel.app`) and add the same URL under **Redirect URLs** (and `http://localhost:3000` for local dev).
3. `.env.local`:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_CE_OS_OPERATOR_EMAILS` — comma-separated list including your test mailbox (e.g. `you@domain.com`).

## Steps

1. `npm run dev`, open `http://localhost:3000`.
2. Expect redirect to **`/login`** if not signed in.
3. Enter an **allowlisted** email → submit → confirm success message about checking email.
4. Open the magic link from mail on **phone or desktop** → should land on `/` with session; initials avatar shows in top-right.
5. Open **avatar menu** → **Sign out** → expect **`/login`** and session cleared.
6. Repeat with an email **not** on the allowlist (use another inbox or temporary address): after clicking the magic link, expect **“This account isn't authorized.”** toast and signed-out state.
7. While signed in, in DevTools → Application → Local Storage, delete Supabase keys → refresh page → expect **“Session expired / Session refreshing failed”** style toast (or equivalent sign-out flow) and redirect to login.

## Deployed preview

Repeat steps 3–6 on a **Vercel preview URL**; ensure that URL is listed under Supabase **Redirect URLs**.
