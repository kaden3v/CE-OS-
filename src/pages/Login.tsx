import { useState, type FormEvent } from "react";
import { Navigate, useLocation } from "react-router";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useAuth } from "@/contexts/AuthContext";
import { isOperatorEmail, signInWithMagicLink } from "@/lib/auth";

export default function Login() {
  const { session, user, loading, configOk } = useAuth();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/";

  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!configOk) {
    return (
      <div className="min-h-screen bg-bg-base flex items-center justify-center p-6">
        <Card className="w-full max-w-md p-6 space-y-3">
          <h1 className="text-xl font-semibold">Login unavailable</h1>
          <p className="text-sm text-text-secondary">
            Add <code className="font-mono text-xs">VITE_SUPABASE_URL</code> and{" "}
            <code className="font-mono text-xs">VITE_SUPABASE_ANON_KEY</code> to your environment.
          </p>
        </Card>
      </div>
    );
  }

  if (loading && configOk) {
    return (
      <div className="min-h-screen bg-bg-base flex items-center justify-center">
        <p className="text-sm text-text-secondary">Checking session…</p>
      </div>
    );
  }

  if (!loading && session && user?.email && isOperatorEmail(user.email)) {
    return <Navigate to={from} replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error: err } = await signInWithMagicLink(email);
    setSubmitting(false);
    if (err) {
      setError(err.message);
      return;
    }
    setSent(true);
  }

  return (
    <div className="min-h-screen bg-bg-base flex items-center justify-center p-6">
      <Card className="w-full max-w-md p-8 space-y-6 border-border-subtle">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">CE-OS</h1>
          <p className="text-sm text-text-secondary mt-1">Sign in with a magic link (operator email only).</p>
        </div>

        {sent ? (
          <div className="rounded-md border border-accent-brand/30 bg-accent-brand-dim px-4 py-3 text-sm text-text-primary">
            Check your email — we sent a sign-in link to <span className="font-medium">{email.trim()}</span>.
            Open it on this device or another; you&apos;ll land back here signed in.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="ce-os-email" className="block text-xs font-medium text-text-tertiary mb-2">
                Work email
              </label>
              <Input
                id="ce-os-email"
                type="email"
                autoComplete="email"
                inputMode="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={submitting}
              />
            </div>
            {error ? (
              <p className="text-sm text-status-alert" role="alert">
                {error}
              </p>
            ) : null}
            <Button type="submit" variant="brand" className="w-full" disabled={submitting}>
              {submitting ? "Sending link…" : "Email me a magic link"}
            </Button>
          </form>
        )}

        <p className="text-[11px] text-text-tertiary leading-relaxed">
          Access is restricted to addresses listed in{" "}
          <code className="font-mono">VITE_CE_OS_OPERATOR_EMAILS</code>. No password is stored in CE-OS.
        </p>
      </Card>
    </div>
  );
}
