import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { Navigate, useLocation } from "react-router";
import { Session, User } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  isConfigured: boolean;
  isAdmin: boolean;
  /** The user's active organization (team workspace). Null if not a member of any org. */
  activeOrgId: string | null;
  /** The user's role within the active organization. */
  orgRole: OrgRole | null;
  /** True once org membership has been loaded at least once. */
  orgChecked: boolean;
  /** Re-fetch the active org + role (call after approval or a role change). */
  refreshOrg: () => Promise<void>;
  /** Null = needs onboarding. Set once on completion. */
  onboardedAt: string | null;
  /** True until we've loaded profile state at least once. */
  profileChecked: boolean;
  signInWithPassword: (email: string, password: string) => Promise<{ error: string | null }>;
  resetPasswordForEmail: (email: string) => Promise<{ error: string | null }>;
  updatePassword: (password: string) => Promise<{ error: string | null }>;
  requestAccess: (input: { email: string; password: string; name?: string; message?: string }) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  /** Force a refresh: refreshes the JWT, re-reads the profile, updates isAdmin. */
  resyncSession: () => Promise<{ ok: boolean; error?: string; isAdmin?: boolean }>;
  /** Re-fetch onboarded state — call after marking onboarding complete. */
  refreshProfile: () => Promise<void>;
  /** Optimistically set onboardedAt in local state (avoids a race where the
   *  Layout's onboarding gate fires before the DB read completes). */
  setOnboardedLocal: (iso: string) => void;
}

export type OrgRole = "owner" | "manager" | "staff";

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [onboardedAt, setOnboardedAt] = useState<string | null>(null);
  const [profileChecked, setProfileChecked] = useState(false);
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);
  const [orgRole, setOrgRole] = useState<OrgRole | null>(null);
  const [orgChecked, setOrgChecked] = useState(!isSupabaseConfigured);
  const [isLoading, setIsLoading] = useState(isSupabaseConfigured);

  const refreshAdminFlag = useCallback(async (uid: string | undefined) => {
    if (!uid || !supabase) {
      setIsAdmin(false);
      setOnboardedAt(null);
      setProfileChecked(true);
      return;
    }
    try {
      const url = import.meta.env.VITE_SUPABASE_URL as string;
      const apikey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
      const ref = url.replace(/^https?:\/\//, "").split(".")[0];
      const stored = localStorage.getItem(`sb-${ref}-auth-token`);
      const accessToken = stored ? (JSON.parse(stored)?.access_token as string | undefined) : undefined;
      if (!accessToken) {
        setIsAdmin(false);
        setOnboardedAt(null);
        setProfileChecked(true);
        return;
      }
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 5000);
      const res = await fetch(
        `${url}/rest/v1/profiles?select=is_admin,onboarded_at&id=eq.${uid}&limit=1`,
        {
          headers: {
            apikey,
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/json",
          },
          signal: ctrl.signal,
        },
      );
      clearTimeout(timer);
      if (!res.ok) {
        console.error("[auth] profile lookup failed", res.status);
        setIsAdmin(false);
        setOnboardedAt(null);
        setProfileChecked(true);
        return;
      }
      const rows = (await res.json()) as Array<{ is_admin?: boolean; onboarded_at?: string | null }>;
      if (!rows.length) {
        // Could mean the user genuinely has no profile (deleted) OR that RLS
        // blocked the read (token edge case). We DO NOT auto-sign-out here:
        // an aggressive sign-out would kick users on transient issues. The
        // app's other write paths will surface FK errors if the user is
        // truly deleted, which the user can recover from via Settings.
        console.warn("[auth] no profile row visible for current user");
        setIsAdmin(false);
        setOnboardedAt(null);
        setProfileChecked(true);
        return;
      }
      setIsAdmin(!!rows[0].is_admin);
      setOnboardedAt(rows[0].onboarded_at ?? null);
      setProfileChecked(true);
    } catch (err) {
      console.error("[auth] profile fetch failed", err);
      setIsAdmin(false);
      setOnboardedAt(null);
      setProfileChecked(true);
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    await refreshAdminFlag(user?.id);
  }, [refreshAdminFlag, user?.id]);

  const setOnboardedLocal = useCallback((iso: string) => {
    setOnboardedAt(iso);
    setProfileChecked(true);
  }, []);

  // Load the user's active org + role. Uses the same direct-fetch-with-stored-token
  // approach as refreshAdminFlag so it's robust during the boot window (before the
  // SDK has finished adopting the session).
  const loadOrg = useCallback(async (uid: string | undefined) => {
    if (!uid || !supabase) {
      // Genuinely signed out — safe to mark checked.
      setActiveOrgId(null);
      setOrgRole(null);
      setOrgChecked(true);
      return;
    }
    try {
      const url = import.meta.env.VITE_SUPABASE_URL as string;
      const apikey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
      const ref = url.replace(/^https?:\/\//, "").split(".")[0];
      const stored = localStorage.getItem(`sb-${ref}-auth-token`);
      const accessToken = stored ? (JSON.parse(stored)?.access_token as string | undefined) : undefined;
      if (!accessToken) {
        // Token not adopted yet during boot — transient. Do NOT conclude
        // "no workspace"; a later auth event / resync re-runs this.
        return;
      }
      const res = await fetch(
        `${url}/rest/v1/org_memberships?select=org_id,role&user_id=eq.${uid}&order=created_at.asc&limit=1`,
        { headers: { apikey, Authorization: `Bearer ${accessToken}`, Accept: "application/json" } },
      );
      if (!res.ok) {
        console.error("[auth] org membership lookup failed", res.status);
        return; // transient — leave orgChecked untouched so the gate doesn't false-fire
      }
      const rows = (await res.json()) as Array<{ org_id?: string; role?: OrgRole }>;
      // Authoritative result (zero rows = legitimately no workspace).
      setActiveOrgId(rows[0]?.org_id ?? null);
      setOrgRole(rows[0]?.role ?? null);
      setOrgChecked(true);
    } catch (err) {
      console.error("[auth] org fetch failed", err);
      // transient — leave orgChecked untouched
    }
  }, []);

  const refreshOrg = useCallback(async () => {
    await loadOrg(user?.id);
  }, [loadOrg, user?.id]);

  useEffect(() => {
    if (user?.id) {
      loadOrg(user.id);
    } else if (!isLoading) {
      // Boot finished with genuinely no signed-in user — safe to conclude
      // "no workspace". During boot, user?.id is briefly undefined; concluding
      // orgChecked=true here (the old behavior) made RequireManager/RequireAdmin
      // redirect owners/admins off any hard-refreshed or deep-linked gated route
      // before the real membership/profile load completed.
      setActiveOrgId(null);
      setOrgRole(null);
      setOrgChecked(true);
    }
  }, [loadOrg, user?.id, isLoading]);

  useEffect(() => {
    if (!supabase) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;

    // Boot path: read session directly from localStorage instead of awaiting
    // supabase.auth.getSession(). The SDK's getSession() has been observed to
    // hang on some clients (probably an internal token-refresh race), which
    // would freeze the entire app on a "Loading…" screen. Reading the JWT
    // synchronously and validating its expiry is reliable and fast — the SDK
    // still ends up authoritative once onAuthStateChange fires, which runs
    // independently and doesn't block the boot.
    const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    const apikey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
    if (url && apikey) {
      const ref = url.replace(/^https?:\/\//, "").split(".")[0];
      const tokenKey = `sb-${ref}-auth-token`;

      const adoptSession = (raw: any) => {
        if (cancelled) return;
        if (!raw?.access_token) return;
        try {
          const payload = JSON.parse(atob(raw.access_token.split(".")[1]));
          setSession(raw as Session);
          setUser(raw.user ?? ({ id: payload.sub, email: payload.email } as User));
          refreshAdminFlag(payload.sub);
        } catch (err) {
          console.warn("[auth] could not parse access token", err);
        }
      };

      try {
        const stored = JSON.parse(localStorage.getItem(tokenKey) ?? "null");
        if (stored?.access_token) {
          const payload = JSON.parse(atob(stored.access_token.split(".")[1]));
          const expiresInMs = payload.exp * 1000 - Date.now();

          if (expiresInMs > 30_000) {
            // Healthy access_token — use it.
            adoptSession(stored);
            setIsLoading(false);
          } else if (stored.refresh_token) {
            // Access token expired or expiring soon — refresh in the background.
            // Show loading until we know the outcome (typical major-app behavior:
            // brief spinner on cold load, then signed in).
            (async () => {
              try {
                const res = await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, {
                  method: "POST",
                  headers: {
                    apikey,
                    Authorization: `Bearer ${apikey}`,
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({ refresh_token: stored.refresh_token }),
                });
                if (!res.ok) {
                  console.warn("[auth] refresh_token rejected", res.status);
                  localStorage.removeItem(tokenKey);
                  return;
                }
                const refreshed = await res.json();
                localStorage.setItem(tokenKey, JSON.stringify(refreshed));
                adoptSession(refreshed);
              } catch (err) {
                console.warn("[auth] refresh failed", err);
              } finally {
                if (!cancelled) setIsLoading(false);
              }
            })();
          } else {
            // No refresh token — discard and go to sign-in
            localStorage.removeItem(tokenKey);
            setIsLoading(false);
          }
        } else {
          setIsLoading(false);
        }
      } catch (err) {
        console.warn("[auth] could not parse stored session", err);
        setIsLoading(false);
      }
    } else {
      setIsLoading(false);
    }

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, s) => {
      if (cancelled) return;
      setSession(s);
      setUser(s?.user ?? null);
      try {
        await refreshAdminFlag(s?.user?.id);
      } catch (err) {
        console.error("[auth] admin refresh failed", err);
      }
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [refreshAdminFlag]);

  const signInWithPassword: AuthContextType["signInWithPassword"] = async (email, password) => {
    if (!supabase) return { error: "Supabase is not configured." };
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      // Don't reveal whether email exists; same message regardless.
      return { error: error.message.includes("Invalid") ? "Email or password is incorrect." : error.message };
    }
    return { error: null };
  };

  const resetPasswordForEmail: AuthContextType["resetPasswordForEmail"] = async (email) => {
    if (!supabase) return { error: "Supabase is not configured." };
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    return { error: error?.message ?? null };
  };

  const updatePassword: AuthContextType["updatePassword"] = async (password) => {
    if (!supabase) return { error: "Supabase is not configured." };
    const { error } = await supabase.auth.updateUser({ password });
    return { error: error?.message ?? null };
  };

  const requestAccess: AuthContextType["requestAccess"] = async ({ email, password, name, message }) => {
    if (!supabase) return { error: "Supabase is not configured." };
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return { error: "Email is required." };
    if (!password || password.length < 8) return { error: "Password must be at least 8 characters." };

    // Public edge function (verify_jwt = false). Creates a banned auth user
    // with the chosen password + a pending access_request. Admin approval
    // unbans the user; deny deletes the user.
    const { data, error } = await supabase.functions.invoke("request-access", {
      body: { email: trimmed, password, name, message },
    });
    if (error) {
      // The Functions SDK wraps non-2xx as `error`. Try to extract the
      // server's message without leaking sensitive detail.
      let detail: string | undefined;
      try {
        const ctxRes = (error as any).context as Response | undefined;
        if (ctxRes) detail = (await ctxRes.json())?.error;
      } catch { /* ignore */ }
      console.error("[requestAccess]", error, detail);
      return { error: detail ?? "Couldn't submit request. Please try again." };
    }
    if (data?.error) return { error: data.error };
    return { error: null };
  };

  const resyncSession: AuthContextType["resyncSession"] = async () => {
    if (!supabase) return { ok: false, error: "Supabase is not configured." };
    try {
      const { data: refreshed, error: refreshErr } = await supabase.auth.refreshSession();
      if (refreshErr) {
        console.warn("[auth] refreshSession failed:", refreshErr.message);
      }
      const uid = refreshed?.session?.user?.id ?? user?.id;
      if (refreshed?.session) {
        setSession(refreshed.session);
        setUser(refreshed.session.user);
      }
      if (!uid) return { ok: false, error: "Not signed in." };
      // Re-use the same direct-fetch path as refreshAdminFlag and update state.
      await refreshAdminFlag(uid);
      await loadOrg(uid);
      // Read the freshest value via REST one more time so we can return it.
      const url = import.meta.env.VITE_SUPABASE_URL as string;
      const apikey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const res = await fetch(
        `${url}/rest/v1/profiles?select=is_admin&id=eq.${uid}&limit=1`,
        {
          headers: {
            apikey,
            Authorization: `Bearer ${session?.access_token ?? ""}`,
            Accept: "application/json",
          },
        },
      );
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
      const rows = (await res.json()) as Array<{ is_admin?: boolean }>;
      const nextIsAdmin = !!rows[0]?.is_admin;
      setIsAdmin(nextIsAdmin);
      return { ok: true, isAdmin: nextIsAdmin };
    } catch (err: any) {
      return { ok: false, error: err?.message ?? "Resync failed" };
    }
  };

  const signOut = async () => {
    // Eagerly clear org state so a fast user switch can't briefly expose the
    // previous member's workspace before the auth effect re-runs.
    setActiveOrgId(null);
    setOrgRole(null);
    await supabase?.auth.signOut();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        isLoading,
        isConfigured: isSupabaseConfigured,
        isAdmin,
        activeOrgId,
        orgRole,
        orgChecked,
        refreshOrg,
        signInWithPassword,
        resetPasswordForEmail,
        updatePassword,
        requestAccess,
        signOut,
        resyncSession,
        refreshProfile,
        setOnboardedLocal,
        onboardedAt,
        profileChecked,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-base">
        <div className="text-text-secondary text-sm">Loading…</div>
      </div>
    );
  }
  if (user) return <>{children}</>;
  return <Navigate to="/sign-in" state={{ from: location }} replace />;
}

/** Gate a route to admins only. */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { isAdmin, isLoading, user, profileChecked } = useAuth();
  if (isLoading || !profileChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-base">
        <div className="text-text-secondary text-sm">Loading…</div>
      </div>
    );
  }
  if (!user || !isAdmin) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

/** Gate a route to org owners/managers. Staff are redirected home.
 *  Note: this is route/UI-level gating. Data-level role restriction (e.g. staff
 *  not being able to read financials at all) would require role-aware RLS and is
 *  tracked as a follow-up. */
export function RequireManager({ children }: { children: ReactNode }) {
  const { orgRole, orgChecked, user, isLoading } = useAuth();
  if (isLoading || !orgChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-base">
        <div className="text-text-secondary text-sm">Loading…</div>
      </div>
    );
  }
  if (!user || (orgRole !== "owner" && orgRole !== "manager")) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}
