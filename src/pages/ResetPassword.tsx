import { useEffect, useState, FormEvent } from "react";
import { useNavigate } from "react-router";
import { Sprout, Lock, ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useAuth } from "@/contexts/AuthContext";

export default function ResetPassword() {
  const { user, updatePassword } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  // After landing here from an email link, Supabase processes the recovery
  // session client-side; the user becomes signed-in with a "recovery" session.
  // If the user just lands here without a session, send them to sign-in.
  useEffect(() => {
    const t = setTimeout(() => {
      // Give Supabase a moment to detect the URL hash session.
      // If after 2s we still have no user, redirect.
      if (!user) navigate("/sign-in", { replace: true });
    }, 2000);
    return () => clearTimeout(t);
  }, [user, navigate]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setPending(true);
    setError("");
    const { error } = await updatePassword(password);
    setPending(false);
    if (error) {
      setError(error);
      return;
    }
    setDone(true);
    setTimeout(() => navigate("/", { replace: true }), 1200);
  };

  return (
    <div className="min-h-screen bg-bg-base text-text-primary flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-2 mb-8">
          <div className="w-10 h-10 rounded-lg bg-accent-brand-dim border border-accent-brand/20 flex items-center justify-center">
            <Sprout className="w-5 h-5 text-accent-brand" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">CEOS</h1>
            <p className="text-xs text-text-tertiary">Set your password</p>
          </div>
        </div>

        <Card className="bg-bg-elevated border border-border-subtle p-6">
          <h2 className="text-lg font-semibold mb-2">{done ? "Password set" : "Choose a password"}</h2>
          {done ? (
            <p className="text-sm text-text-secondary">Signing you in…</p>
          ) : (
            <>
              <p className="text-sm text-text-secondary mb-6">
                Pick a password that's at least 8 characters.
              </p>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs uppercase tracking-wide text-text-secondary">New password</label>
                  <div className="relative">
                    <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
                    <Input
                      type="password"
                      required
                      autoFocus
                      autoComplete="new-password"
                      minLength={8}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-8"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs uppercase tracking-wide text-text-secondary">Confirm</label>
                  <div className="relative">
                    <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
                    <Input
                      type="password"
                      required
                      autoComplete="new-password"
                      minLength={8}
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      className="w-full pl-8"
                    />
                  </div>
                </div>
                {error && <div className="text-xs text-status-alert">{error}</div>}
                <Button type="submit" variant="brand" className="w-full" disabled={pending}>
                  {pending ? "Saving…" : (<>Set password <ArrowRight className="w-4 h-4" /></>)}
                </Button>
              </form>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
