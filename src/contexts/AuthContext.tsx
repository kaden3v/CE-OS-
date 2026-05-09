import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import {
  getSupabaseClient,
  hasSupabaseAuthConfig,
  isOperatorEmail,
  signOutUser,
  subscribeAuthState,
} from "@/lib/auth";
import { useApp } from "@/contexts/AppContext";

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  configOk: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { addToast } = useApp();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const configOk = hasSupabaseAuthConfig();

  const intentionalSignOutRef = useRef(false);
  const allowlistRejectRef = useRef(false);
  const hadSessionRef = useRef(false);

  const enforceAllowlist = useCallback(
    async (nextSession: Session | null): Promise<boolean> => {
      const email = nextSession?.user?.email;
      if (!nextSession || !email) return true;
      if (isOperatorEmail(email)) return true;
      allowlistRejectRef.current = true;
      await signOutUser();
      addToast({
        title: "This account isn't authorized.",
        description: "Sign in with an email on the operator allowlist.",
        status: "alert",
      });
      setSession(null);
      return false;
    },
    [addToast]
  );

  const signOut = useCallback(async () => {
    intentionalSignOutRef.current = true;
    await signOutUser();
  }, []);

  useEffect(() => {
    if (!configOk) {
      setLoading(false);
      return;
    }

    let mounted = true;

    const supabase = getSupabaseClient();

    supabase.auth.getSession().then(async ({ data: { session: initial } }) => {
      if (!mounted) return;
      if (initial?.user?.email && !isOperatorEmail(initial.user.email)) {
        allowlistRejectRef.current = true;
        await signOutUser();
        addToast({
          title: "This account isn't authorized.",
          description: "Sign in with an email on the operator allowlist.",
          status: "alert",
        });
        setSession(null);
        hadSessionRef.current = false;
      } else {
        setSession(initial);
        hadSessionRef.current = !!initial;
      }
      setLoading(false);
    });

    const { data } = subscribeAuthState(async (event, nextSession) => {
      if (!mounted) return;

      if (nextSession) {
        const ok = await enforceAllowlist(nextSession);
        if (!ok) {
          hadSessionRef.current = false;
          return;
        }
        setSession(nextSession);
        hadSessionRef.current = true;
        return;
      }

      setSession(null);

      if (event === "SIGNED_OUT") {
        if (allowlistRejectRef.current) {
          allowlistRejectRef.current = false;
          hadSessionRef.current = false;
          return;
        }
        if (intentionalSignOutRef.current) {
          intentionalSignOutRef.current = false;
          hadSessionRef.current = false;
          return;
        }
        if (hadSessionRef.current) {
          addToast({
            title: "Session expired",
            description: "Session refreshing failed — please sign in again.",
            status: "warn",
          });
        }
        hadSessionRef.current = false;
      }
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, [addToast, configOk, enforceAllowlist]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      configOk,
      signOut,
    }),
    [session, loading, configOk, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
