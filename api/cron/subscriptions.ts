// Vercel Cron — daily at 13:00 UTC (06:00 America/Phoenix, no DST).
// Scheduled in vercel.json. Calls the idempotent Postgres worker
// process_due_subscriptions() with the Supabase service role.
//
// Required Vercel env vars:
//   SUPABASE_URL (or VITE_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET
// Vercel sends `Authorization: Bearer ${CRON_SECRET}` on scheduled invocations.
//
// This file is excluded from the app's tsconfig; Vercel builds it as a
// standalone Node serverless function.

export const config = { runtime: "nodejs" };

export default async function handler(req: any, res: any) {
  // Fail closed: require CRON_SECRET to be configured AND matched. Vercel sends
  // it as the bearer on scheduled invocations; an unset secret must NOT mean
  // "open" since this endpoint mutates data.
  const secret = process.env.CRON_SECRET;
  const auth = req.headers?.authorization;
  if (!secret || auth !== `Bearer ${secret}`) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    res.status(500).json({ error: "Supabase service env not configured" });
    return;
  }

  try {
    const r = await fetch(`${url}/rest/v1/rpc/process_due_subscriptions`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: "{}",
    });
    const body = await r.json().catch(() => null);
    if (!r.ok) {
      res.status(502).json({ ok: false, error: body });
      return;
    }
    res.status(200).json({ ok: true, processed: body });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message ?? "error" });
  }
}
