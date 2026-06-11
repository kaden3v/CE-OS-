import { useState, FormEvent } from "react";
import { Navigate, useLocation } from "react-router";
import { Sprout, Mail, Lock, ArrowRight, X, Send, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { useAuth } from "@/contexts/AuthContext";

type View = "signin" | "request" | "forgot";

export default function SignIn() {
  const { user, isConfigured, signInWithPassword, requestAccess, resetPasswordForEmail } = useAuth();
  const location = useLocation() as { state?: { from?: Location } };

  const [view, setView] = useState<View>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [reqPassword, setReqPassword] = useState("");
  const [reqConfirm, setReqConfirm] = useState("");
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [forgotEmail, setForgotEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [requestSent, setRequestSent] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  if (user) {
    const dest = (location.state?.from as any)?.pathname ?? "/";
    return <Navigate to={dest} replace />;
  }

  const handleSignIn = async (e: FormEvent) => {
    e.preventDefault();
    setPending(true);
    setErrorMsg("");
    const { error } = await signInWithPassword(email, password);
    setPending(false);
    if (error) setErrorMsg(error);
  };

  const handleRequest = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    if (reqPassword.length < 8) {
      setErrorMsg("Password must be at least 8 characters.");
      return;
    }
    if (reqPassword !== reqConfirm) {
      setErrorMsg("Passwords don't match.");
      return;
    }
    setPending(true);
    const { error } = await requestAccess({ email, password: reqPassword, name, message });
    setPending(false);
    if (error) setErrorMsg(error);
    else setRequestSent(true);
  };

  const handleForgot = async (e: FormEvent) => {
    e.preventDefault();
    setPending(true);
    setErrorMsg("");
    const { error } = await resetPasswordForEmail(forgotEmail);
    setPending(false);
    // Generic UX: always claim success even if email wasn't registered, to avoid enumeration.
    setResetSent(true);
    if (error) console.error("reset error", error);
  };

  // Live request-form validation — drives inline hints + the submit button so a
  // click can never silently no-op (the previous "looks like it restarted" bug).
  const reqPwTooShort = reqPassword.length > 0 && reqPassword.length < 8;
  const reqMismatch = reqConfirm.length > 0 && reqPassword !== reqConfirm;
  const reqValid = !!email.trim() && reqPassword.length >= 8 && reqPassword === reqConfirm;

  return (
    <div className="min-h-dvh bg-bg-base text-text-primary flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-2 mb-8">
          <div className="w-10 h-10 rounded-lg bg-accent-brand-dim border border-accent-brand/20 flex items-center justify-center">
            <Sprout className="w-5 h-5 text-accent-brand" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">CEOS</h1>
            <p className="text-xs text-text-tertiary">Canyon Exotics operations</p>
          </div>
        </div>

        {!isConfigured && (
          <div className="mb-4 p-2 rounded-md bg-status-warn/10 border border-status-warn/30 text-xs text-status-warn">
            Supabase not configured. Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> in your environment.
          </div>
        )}

        {/* Sign in */}
        {view === "signin" && (
          <Card className="bg-bg-elevated border border-border-subtle p-6 mb-4">
            <h2 className="text-lg font-semibold mb-2">Sign in</h2>
            <p className="text-sm text-text-secondary mb-6">
              Enter your email and password to continue.
            </p>

            <form onSubmit={handleSignIn} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="email" className="text-xs uppercase tracking-wide text-text-secondary">Email</label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
                  <Input
                    id="email"
                    type="email"
                    required
                    autoFocus
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-8"
                    disabled={!isConfigured || pending}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label htmlFor="password" className="text-xs uppercase tracking-wide text-text-secondary">Password</label>
                  <button
                    type="button"
                    onClick={() => { setView("forgot"); setErrorMsg(""); setResetSent(false); setForgotEmail(email); }}
                    className="text-xs text-text-secondary hover:text-text-primary transition-colors"
                  >
                    Forgot?
                  </button>
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
                  <Input
                    id="password"
                    type="password"
                    required
                    autoComplete="current-password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-8"
                    disabled={!isConfigured || pending}
                  />
                </div>
              </div>
              {errorMsg && <div className="text-xs text-status-alert">{errorMsg}</div>}
              <Button type="submit" variant="brand" className="w-full" disabled={!isConfigured || pending}>
                {pending ? "Signing in…" : (
                  <>Sign in <ArrowRight className="w-4 h-4" /></>
                )}
              </Button>
            </form>

            <div className="mt-6 pt-6 border-t border-border-subtle">
              <p className="text-xs text-text-secondary mb-2">No account yet?</p>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => { setView("request"); setErrorMsg(""); setRequestSent(false); }}
                disabled={!isConfigured}
              >
                Request access
              </Button>
            </div>
          </Card>
        )}

        {/* Request access */}
        {view === "request" && (
          <Card className="bg-bg-elevated border border-border-subtle p-6 mb-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-semibold">Request access</h2>
              <button
                onClick={() => { setView("signin"); setErrorMsg(""); }}
                className="text-text-secondary hover:text-text-primary p-1"
                aria-label="Back to sign in"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-sm text-text-secondary mb-6">
              Pick an email and password. Once an admin approves, you'll be able to sign in immediately — no setup email needed.
            </p>

            {requestSent ? (
              <div className="p-4 rounded-md bg-accent-brand-dim border border-accent-brand/20 text-sm">
                <p className="font-medium mb-2 text-accent-brand">Request submitted</p>
                <p className="text-text-secondary text-xs">
                  Thanks! Once approved, sign in with <span className="text-text-primary">{email}</span> and the password you just chose.
                </p>
                <button
                  onClick={() => {
                    setView("signin");
                    setRequestSent(false);
                    setName("");
                    setMessage("");
                    setReqPassword("");
                    setReqConfirm("");
                    // Pre-fill sign-in with the email they used
                  }}
                  className="text-xs text-accent-brand hover:underline mt-4 inline-flex items-center gap-1"
                >
                  <ArrowLeft className="w-3 h-3" /> Back to sign in
                </button>
              </div>
            ) : (
              <form onSubmit={handleRequest} className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="req-email" className="text-xs uppercase tracking-wide text-text-secondary">Email *</label>
                  <div className="relative">
                    <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
                    <Input
                      id="req-email"
                      type="email"
                      required
                      autoFocus
                      autoComplete="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full pl-8"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label htmlFor="req-password" className="text-xs uppercase tracking-wide text-text-secondary">Choose a password *</label>
                  <div className="relative">
                    <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
                    <Input
                      id="req-password"
                      type="password"
                      required
                      autoComplete="new-password"
                      minLength={8}
                      placeholder="At least 8 characters"
                      value={reqPassword}
                      onChange={(e) => setReqPassword(e.target.value)}
                      className="w-full pl-8"
                    />
                  </div>
                  {reqPwTooShort && <p className="text-xs text-status-warn">Must be at least 8 characters.</p>}
                </div>
                <div className="space-y-2">
                  <label htmlFor="req-confirm" className="text-xs uppercase tracking-wide text-text-secondary">Confirm password *</label>
                  <div className="relative">
                    <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
                    <Input
                      id="req-confirm"
                      type="password"
                      required
                      autoComplete="new-password"
                      minLength={8}
                      value={reqConfirm}
                      onChange={(e) => setReqConfirm(e.target.value)}
                      className="w-full pl-8"
                    />
                  </div>
                  {reqMismatch && <p className="text-xs text-status-warn">Passwords don't match.</p>}
                </div>
                <div className="space-y-2">
                  <label htmlFor="req-name" className="text-xs uppercase tracking-wide text-text-secondary">Name</label>
                  <Input
                    id="req-name"
                    placeholder="Jane Doe"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="req-msg" className="text-xs uppercase tracking-wide text-text-secondary">Message (optional)</label>
                  <textarea
                    id="req-msg"
                    rows={2}
                    placeholder="Why you'd like access"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    maxLength={500}
                    className="w-full bg-bg-elevated border border-border-strong rounded-[8px] px-3 py-2 text-sm placeholder:text-text-secondary focus:outline-none focus:border-accent-brand focus:ring-1 focus:ring-accent-brand transition-colors resize-none"
                  />
                </div>
                {errorMsg && <div className="text-xs text-status-alert">{errorMsg}</div>}
                <Button type="submit" variant="brand" className="w-full" disabled={pending || !reqValid}>
                  {pending ? "Submitting…" : (<>Submit request <Send className="w-4 h-4" /></>)}
                </Button>
              </form>
            )}
          </Card>
        )}

        {/* Forgot password */}
        {view === "forgot" && (
          <Card className="bg-bg-elevated border border-border-subtle p-6 mb-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-semibold">Reset password</h2>
              <button
                onClick={() => { setView("signin"); setErrorMsg(""); }}
                className="text-text-secondary hover:text-text-primary p-1"
                aria-label="Back to sign in"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {resetSent ? (
              <div className="p-4 rounded-md bg-accent-brand-dim border border-accent-brand/20 text-sm">
                <p className="font-medium mb-2 text-accent-brand">Check your inbox</p>
                <p className="text-text-secondary text-xs">
                  If an account exists for <span className="text-text-primary">{forgotEmail}</span>, we sent a reset link.
                </p>
                <button
                  onClick={() => { setView("signin"); setResetSent(false); }}
                  className="text-xs text-accent-brand hover:underline mt-4 inline-flex items-center gap-1"
                >
                  <ArrowLeft className="w-3 h-3" /> Back to sign in
                </button>
              </div>
            ) : (
              <form onSubmit={handleForgot} className="space-y-4">
                <p className="text-sm text-text-secondary">Enter your email — we'll send you a link to set a new password.</p>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
                  <Input
                    type="email"
                    required
                    autoFocus
                    placeholder="you@example.com"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    className="w-full pl-8"
                  />
                </div>
                <Button type="submit" variant="brand" className="w-full" disabled={pending}>
                  {pending ? "Sending…" : "Send reset link"}
                </Button>
              </form>
            )}
          </Card>
        )}

      </div>
    </div>
  );
}
