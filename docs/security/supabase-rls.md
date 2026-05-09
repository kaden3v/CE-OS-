# Supabase Row Level Security (stub)

CE-OS currently keeps application state in **browser `localStorage`** (see entity hooks). There are **no Supabase Postgres tables** wired for CE-OS yet.

When data moves into Supabase (orders, inventory, cultivars, etc.), **RLS must be enabled before exposing anon/authenticated keys** from the client.

## First policies to add (template)

1. **Enable RLS** on every table: `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;`
2. **Operator-only access** — Map Supabase Auth `auth.users` / JWT email to your allowlist:
   - Either store allowed operators in a small `app_operators(email text primary key)` table maintained manually.
   - Or compare `auth.jwt() ->> 'email'` to a fixed allowlist via policy `USING` clause (less flexible).
3. **Default deny** — No `SELECT`/`INSERT`/`UPDATE`/`DELETE` policies until explicitly granted.
4. **Service role** — Reserved for server-side jobs only; never ship the service role key to the browser.

Example sketch (adjust schema names):

```sql
-- Example: only authenticated users whose email is in app_operators
CREATE POLICY "operators_select_own_rows"
  ON public.orders FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.app_operators o
      WHERE o.email = (auth.jwt() ->> 'email')
    )
  );
```

## Relation to CE-OS env allowlist

`VITE_CE_OS_OPERATOR_EMAILS` gates **who may open the SPA**. Supabase RLS gates **who may read/write rows**. Keep them aligned when you introduce tables (same email set, or derive policies from a single source of truth in the database).
