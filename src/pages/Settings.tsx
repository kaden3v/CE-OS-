import { useEffect, useState, FormEvent } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { StatusDot } from "@/components/ui/StatusDot";
import { Toggle } from "@/components/ui/Toggle";
import { Badge } from "@/components/ui/Badge";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { friendlyDbError } from "@/lib/dbErrors";
import { Keyboard, TerminalSquare, LogOut, Lock, ShieldCheck, Plus, Trash2, Mail, ExternalLink, RefreshCw } from "lucide-react";
import { Link } from "react-router";
import { ChannelFeesSettings } from "@/components/settings/ChannelFeesSettings";

type NotificationPrefs = {
  low_stock?: boolean;
  license_expiring?: boolean;
  new_access_request?: boolean;
  new_order?: boolean;
};

const NOTIFICATION_KEYS: { key: keyof NotificationPrefs; label: string; desc: string; adminOnly?: boolean }[] = [
  { key: "low_stock", label: "Low stock", desc: "When a supply or plant drops below its reorder threshold." },
  { key: "license_expiring", label: "License expiring", desc: "When a permit or license is within 60 days of expiration." },
  { key: "new_access_request", label: "New access request", desc: "When someone submits a request to join.", adminOnly: true },
  { key: "new_order", label: "New order", desc: "When a new Shopify or Etsy order arrives." },
];

const CONNECTORS = [
  { name: "Supabase", configured: true, note: "Postgres + auth + storage" },
  { name: "Shopify", configured: true, note: "Storefront orders + listings (live webhook)" },
  { name: "Etsy", configured: true, note: "Marketplace orders (10-min poll sync)" },
  { name: "USPS", configured: true, note: "Tracking deep-links on shipments" },
  { name: "Weather API", configured: true, note: "Heat-window shipment holds" },
  { name: "Stripe", configured: false, note: "Payments + subscriptions" },
];

export default function Settings() {
  const { settings, updateSettings, setCommandPaletteOpen, addToast } = useApp();
  const { user, isConfigured, isAdmin, signOut, resyncSession } = useAuth();
  const [resyncing, setResyncing] = useState(false);

  const handleResync = async () => {
    setResyncing(true);
    const result = await resyncSession();
    setResyncing(false);
    if (!result.ok) {
      addToast({ title: "Re-sync failed", description: result.error, status: "alert" });
      return;
    }
    addToast({
      title: "Session refreshed",
      description: result.isAdmin ? "You are an admin." : "No admin role.",
      status: result.isAdmin ? "ok" : "info",
    });
  };

  const [displayName, setDisplayName] = useState("");
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);

  // Password change
  const [pwOpen, setPwOpen] = useState(false);
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [changingPw, setChangingPw] = useState(false);

  // Notification prefs
  const [notifPrefs, setNotifPrefs] = useState<NotificationPrefs>({});

  // Admin allowlist (only loaded if isAdmin)
  const [adminEmails, setAdminEmails] = useState<{ email: string; added_at: string }[]>([]);
  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [loadingAdmins, setLoadingAdmins] = useState(false);

  // Load profile
  useEffect(() => {
    if (!user || !supabase) return;
    supabase
      .from("profiles")
      .select("display_name, notification_prefs")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) console.error("[Settings] load profile failed:", error.message);
        setDisplayName(data?.display_name ?? "");
        setNotifPrefs((data?.notification_prefs as NotificationPrefs | null) ?? {});
        setProfileLoaded(true);
      });
  }, [user?.id]);

  // Load admin allowlist
  useEffect(() => {
    if (!isAdmin || !supabase) return;
    setLoadingAdmins(true);
    supabase
      .from("admin_emails")
      .select("email, added_at")
      .order("added_at", { ascending: true })
      .then(({ data, error }) => {
        if (error) console.error("[Settings] load admin emails:", error.message);
        setAdminEmails(data ?? []);
        setLoadingAdmins(false);
      });
  }, [isAdmin]);

  const saveProfile = async () => {
    if (!user || !supabase) return;
    setSavingProfile(true);
    const { error } = await supabase
      .from("profiles")
      .update({ display_name: displayName.trim() || null })
      .eq("id", user.id);
    setSavingProfile(false);
    if (error) {
      if (error.code === "23503") {
        addToast({ title: "Your session expired", description: "Signing you out…", status: "warn" });
        setTimeout(() => signOut(), 800);
        return;
      }
      addToast({ title: "Save failed", description: friendlyDbError(error), status: "alert" });
      return;
    }
    addToast({ title: "Profile saved", status: "ok" });
  };

  const saveNotifPref = async (key: keyof NotificationPrefs, checked: boolean) => {
    if (!user || !supabase) return;
    const next = { ...notifPrefs, [key]: checked };
    setNotifPrefs(next);
    const { error } = await supabase.from("profiles").update({ notification_prefs: next }).eq("id", user.id);
    if (error) {
      addToast({ title: "Couldn't save preference", description: friendlyDbError(error), status: "alert" });
      setNotifPrefs(notifPrefs);
    }
  };

  const handlePasswordChange = async (e: FormEvent) => {
    e.preventDefault();
    if (newPw.length < 8) return addToast({ title: "Password must be at least 8 characters", status: "warn" });
    if (newPw !== confirmPw) return addToast({ title: "Passwords don't match", status: "warn" });
    if (!supabase || !user?.email) return;

    setChangingPw(true);

    // Re-verify current password before changing — defense against a stolen
    // session being able to lock the real owner out by changing their password.
    const { error: verifyErr } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPw,
    });
    if (verifyErr) {
      setChangingPw(false);
      addToast({ title: "Current password is incorrect", status: "alert" });
      return;
    }

    const { error: updateErr } = await supabase.auth.updateUser({ password: newPw });
    setChangingPw(false);
    if (updateErr) {
      addToast({ title: "Couldn't update password", description: updateErr.message, status: "alert" });
      return;
    }
    setPwOpen(false);
    setCurrentPw("");
    setNewPw("");
    setConfirmPw("");
    addToast({ title: "Password updated", status: "ok" });
  };

  const handleAddAdmin = async (e: FormEvent) => {
    e.preventDefault();
    const email = newAdminEmail.trim().toLowerCase();
    if (!email) return;
    if (!supabase) return;
    const { error } = await supabase.from("admin_emails").insert({ email });
    if (error) {
      addToast({ title: "Couldn't add admin", description: friendlyDbError(error), status: "alert" });
      return;
    }
    setAdminEmails((prev) => [...prev, { email, added_at: new Date().toISOString() }]);
    setNewAdminEmail("");
    addToast({
      title: "Admin email added",
      description: "Promoted next time they sign up. To promote an existing user, run the SQL update manually.",
      status: "ok",
    });
  };

  const handleRemoveAdmin = async (email: string) => {
    if (email === user?.email) {
      const ok = confirm("This is your own email. Removing it will demote you when you next sign in. Continue?");
      if (!ok) return;
    } else {
      if (!confirm(`Remove ${email} from the admin allowlist? Existing admin users keep access until you also flip their profile.is_admin to false.`)) return;
    }
    if (!supabase) return;
    const { error } = await supabase.from("admin_emails").delete().eq("email", email);
    if (error) {
      addToast({ title: "Couldn't remove", description: friendlyDbError(error), status: "alert" });
      return;
    }
    setAdminEmails((prev) => prev.filter((a) => a.email !== email));
    addToast({ title: "Removed from allowlist", status: "info" });
  };

  const isDev = settings.developerMode || new URLSearchParams(window.location.search).get("dev") === "1";

  const initials =
    (displayName || user?.email || "??")
      .split(/[\s@.]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase() ?? "")
      .join("") || "??";

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto h-full flex flex-col">
      <div className="mb-8 border-b border-border-subtle pb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold mb-2">Settings</h1>
          <p className="text-sm text-text-secondary">System configuration and integrations.</p>
        </div>
        {!isDev && (
          <button
            className="w-12 h-12 opacity-0 cursor-default"
            onClick={() => updateSettings({ developerMode: true })}
            title="Enable Developer Mode"
            aria-label="Enable developer mode"
          />
        )}
      </div>

      <div className="space-y-8 pb-12">
        {/* Account */}
        <section>
          <h2 className="text-lg font-medium mb-4">Account</h2>
          <Card className="p-6 flex items-start gap-6">
            <div className="w-20 h-20 rounded-full bg-bg-active border border-border-subtle flex items-center justify-center text-2xl font-medium shrink-0">
              {initials}
            </div>
            <div className="flex-1 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label htmlFor="display-name" className="text-xs uppercase tracking-wide text-text-secondary">Display Name</label>
                  <Input
                    id="display-name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    disabled={!profileLoaded}
                    className="w-full"
                    placeholder="Your name"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs uppercase tracking-wide text-text-secondary">Email</label>
                  <Input value={user?.email ?? ""} disabled className="w-full opacity-50" />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={saveProfile} disabled={!profileLoaded || savingProfile}>
                  {savingProfile ? "Saving…" : "Save Profile"}
                </Button>
                <Button variant="outline" onClick={() => setPwOpen(true)}>
                  <Lock className="w-4 h-4 mr-1" />
                  Change password
                </Button>
                <Button variant="ghost" onClick={signOut} className="text-text-secondary ml-auto">
                  <LogOut className="w-4 h-4" />
                  Sign out
                </Button>
              </div>

              {user && (
                <div className="mt-2 pt-4 border-t border-border-subtle flex items-center justify-between gap-4">
                  <div className="flex flex-col gap-1 text-xs text-text-secondary">
                    <div className="flex items-center gap-2">
                      <span className="text-text-tertiary">Role:</span>
                      <Badge variant={isAdmin ? "brand" : "outline"}>
                        {isAdmin ? "Admin" : "Member"}
                      </Badge>
                    </div>
                    <div className="text-text-tertiary">
                      Signed in {user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString() : "now"}
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={handleResync} disabled={resyncing}>
                    <RefreshCw className={`w-3.5 h-3.5 mr-1 ${resyncing ? "animate-spin" : ""}`} />
                    {resyncing ? "Re-checking…" : "Re-check"}
                  </Button>
                </div>
              )}
              {!isConfigured && (
                <p className="text-xs text-status-warn">
                  Supabase not configured. Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> in your environment.
                </p>
              )}
            </div>
          </Card>
        </section>

        {/* Display */}
        <section>
          <h2 className="text-lg font-medium mb-4">Display</h2>
          <Card className="divide-y divide-border-subtle p-0">
            <div className="p-4 flex items-center justify-between">
              <div>
                <div className="font-medium text-sm">Compact density</div>
                <div className="text-xs text-text-secondary mt-2">
                  Reduce padding and text size in data tables for higher data density.
                </div>
              </div>
              <Toggle
                ariaLabel="Compact density"
                checked={settings.density === "compact"}
                onChange={(checked) => updateSettings({ density: checked ? "compact" : "comfortable" })}
              />
            </div>
          </Card>
        </section>

        {/* Notifications */}
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-medium">Notifications</h2>
            <Badge variant="outline" className="text-xs text-status-warn border-status-warn/20">Preview — wiring in progress</Badge>
          </div>
          <Card className="divide-y divide-border-subtle p-0">
            {NOTIFICATION_KEYS.filter((n) => !n.adminOnly || isAdmin).map((n) => (
              <div key={n.key} className="p-4 flex items-center justify-between">
                <div>
                  <div className="font-medium text-sm">{n.label}</div>
                  <div className="text-xs text-text-secondary mt-2">{n.desc}</div>
                </div>
                <Toggle
                  ariaLabel={n.label}
                  checked={!!notifPrefs[n.key]}
                  onChange={(checked) => saveNotifPref(n.key, checked)}
                  disabled={!profileLoaded}
                />
              </div>
            ))}
          </Card>
          <p className="text-xs text-text-tertiary italic mt-2">
            Preferences persist now. Delivery — email or in-app — will fire once we wire the triggers.
          </p>
        </section>

        {/* Admin section */}
        {isAdmin && (
          <section>
            <h2 className="text-lg font-medium mb-4 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-accent-brand" />
              Admin
            </h2>

            <Card className="p-4 mb-4">
              <Link to="/admin/access-requests" className="flex items-center justify-between hover:bg-bg-hover -m-4 p-4 rounded-md transition-colors group">
                <div>
                  <div className="font-medium text-sm">Access Requests</div>
                  <div className="text-xs text-text-secondary mt-2">Review and approve / deny access requests.</div>
                </div>
                <ExternalLink className="w-4 h-4 text-text-tertiary group-hover:text-text-primary transition-colors" />
              </Link>
            </Card>

            <Card className="p-4">
              <h3 className="font-medium text-sm mb-2">Admin allowlist</h3>
              <p className="text-xs text-text-secondary mb-4">
                Emails added here are automatically promoted to admin when their account is created. Existing users are not retroactively promoted.
              </p>
              <form onSubmit={handleAddAdmin} className="flex gap-2 mb-4">
                <Input
                  type="email"
                  placeholder="newadmin@example.com"
                  value={newAdminEmail}
                  onChange={(e) => setNewAdminEmail(e.target.value)}
                  className="flex-1"
                />
                <Button type="submit" variant="outline">
                  <Plus className="w-4 h-4 mr-1" />
                  Add
                </Button>
              </form>
              {loadingAdmins ? (
                <div className="text-sm text-text-tertiary">Loading…</div>
              ) : adminEmails.length === 0 ? (
                <div className="text-sm text-text-tertiary italic">No emails on the allowlist.</div>
              ) : (
                <ul className="divide-y divide-border-subtle border border-border-subtle rounded-md">
                  {adminEmails.map((a) => (
                    <li key={a.email} className="flex items-center justify-between p-2 px-3">
                      <div className="flex items-center gap-2 text-sm">
                        <Mail className="w-3.5 h-3.5 text-text-tertiary" />
                        <span>{a.email}</span>
                        {a.email === user?.email && <Badge variant="brand" className="text-xs">you</Badge>}
                      </div>
                      <button
                        onClick={() => handleRemoveAdmin(a.email)}
                        aria-label={`Remove ${a.email}`}
                        className="p-1 text-text-tertiary hover:text-status-alert rounded transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </section>
        )}

        {/* Finances */}
        <section>
          <h2 className="text-lg font-medium mb-4">Finances</h2>
          <ChannelFeesSettings />
        </section>

        {/* Connectors */}
        <section>
          <h2 className="text-lg font-medium mb-4">Connectors</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {CONNECTORS.map((c) => {
              // Mark Supabase honestly based on current configuration
              const configured = c.name === "Supabase" ? isConfigured : c.configured;
              return (
                <Card key={c.name} className="p-4 flex items-start justify-between gap-4">
                  <div>
                    <div className="font-medium">{c.name}</div>
                    <div className="text-xs text-text-secondary mt-2">{c.note}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-xs ${configured ? "text-status-ok" : "text-text-secondary"}`}>
                      {configured ? "Connected" : "Not configured"}
                    </span>
                    <StatusDot status={configured ? "ok" : "warn"} />
                  </div>
                </Card>
              );
            })}
          </div>
        </section>

        {/* Developer Tools */}
        {isDev && (
          <section className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            <h2 className="text-lg font-medium mb-4 text-status-info flex items-center gap-2">
              <TerminalSquare className="w-5 h-5" />
              Developer Tools
            </h2>
            <Card className="border-status-info/20 divide-y divide-border-subtle p-0">
              <div className="p-4 flex items-center justify-between">
                <div>
                  <div className="font-medium text-sm">Force loading state</div>
                  <div className="text-xs text-text-secondary mt-2">Forces skeleton UI to persist across all data views.</div>
                </div>
                <Toggle ariaLabel="Force loading" checked={settings.loadingMode} onChange={(c) => updateSettings({ loadingMode: c })} tone="warn" />
              </div>
              <div className="p-4 flex items-center justify-between">
                <div>
                  <div className="font-medium text-sm">Force error state</div>
                  <div className="text-xs text-text-secondary mt-2">Simulates fetch failures across all data views.</div>
                </div>
                <Toggle ariaLabel="Force error" checked={settings.errorMode} onChange={(c) => updateSettings({ errorMode: c })} tone="alert" />
              </div>
              <div className="p-4 flex items-center justify-between">
                <div>
                  <div className="font-medium text-sm">Force empty state</div>
                  <div className="text-xs text-text-secondary mt-2">Simulates zero-result responses for all lists.</div>
                </div>
                <Toggle ariaLabel="Force empty" checked={settings.emptyMode} onChange={(c) => updateSettings({ emptyMode: c })} />
              </div>
              <div className="p-4 flex items-center justify-between">
                <div>
                  <div className="font-medium text-sm">Reset local data</div>
                  <div className="text-xs text-text-secondary mt-2">Clears localStorage caches. Server data is unaffected.</div>
                </div>
                <Button
                  variant="outline"
                  className="h-8"
                  onClick={() => {
                    Object.keys(localStorage)
                      .filter((k) => k.startsWith("ceos:"))
                      .forEach((k) => localStorage.removeItem(k));
                    window.location.reload();
                  }}
                >
                  Reset
                </Button>
              </div>
              <div className="p-4 flex items-center justify-between">
                <div>
                  <div className="font-medium text-sm flex items-center gap-2">
                    <Keyboard className="w-4 h-4" /> Command palette
                  </div>
                  <div className="text-xs text-text-secondary mt-2">Global search and command execution.</div>
                </div>
                <Button variant="outline" className="h-8 px-2 flex items-center gap-2" onClick={() => setCommandPaletteOpen(true)}>
                  <kbd className="font-sans text-[10px] bg-bg-active px-2 rounded">⌘</kbd>
                  <kbd className="font-sans text-[10px] bg-bg-active px-2 rounded">K</kbd>
                </Button>
              </div>
            </Card>
          </section>
        )}
      </div>

      {/* Change-password modal */}
      {pwOpen && (
        <div className="fixed inset-0 bg-bg-base/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md bg-bg-elevated border-border-strong shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-border-subtle">
              <h2 className="text-lg font-semibold">Change password</h2>
              <button onClick={() => { setPwOpen(false); setCurrentPw(""); setNewPw(""); setConfirmPw(""); }} aria-label="Close" className="text-text-secondary hover:text-text-primary">
                <Lock className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handlePasswordChange} className="p-4 space-y-4">
              <div>
                <label htmlFor="current-pw" className="text-xs uppercase tracking-wide text-text-secondary">Current password</label>
                <Input id="current-pw" type="password" required autoComplete="current-password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} className="w-full mt-1" />
              </div>
              <div>
                <label htmlFor="new-pw" className="text-xs uppercase tracking-wide text-text-secondary">New password</label>
                <Input id="new-pw" type="password" required autoComplete="new-password" minLength={8} value={newPw} onChange={(e) => setNewPw(e.target.value)} className="w-full mt-1" />
                {newPw.length > 0 && newPw.length < 8 && (
                  <p className="text-xs text-status-warn mt-1">At least 8 characters ({8 - newPw.length} to go).</p>
                )}
              </div>
              <div>
                <label htmlFor="confirm-pw" className="text-xs uppercase tracking-wide text-text-secondary">Confirm new password</label>
                <Input id="confirm-pw" type="password" required autoComplete="new-password" minLength={8} value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} className="w-full mt-1" />
                {confirmPw.length > 0 && confirmPw !== newPw && (
                  <p className="text-xs text-status-alert mt-1">Doesn't match.</p>
                )}
                {confirmPw.length > 0 && confirmPw === newPw && newPw.length >= 8 && (
                  <p className="text-xs text-status-ok mt-1">Match.</p>
                )}
              </div>
              <p className="text-xs text-text-tertiary">We re-verify your current password before changing it — defense against a stolen session locking you out.</p>
              <div className="pt-2 flex justify-end gap-2 border-t border-border-subtle">
                <Button variant="ghost" type="button" onClick={() => { setPwOpen(false); setCurrentPw(""); setNewPw(""); setConfirmPw(""); }}>Cancel</Button>
                <Button
                  type="submit"
                  disabled={changingPw || !currentPw || newPw.length < 8 || newPw !== confirmPw}
                >
                  {changingPw ? "Updating…" : "Update password"}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
