import { Navigate, Outlet, useLocation } from "react-router";
import { useAuth } from "@/contexts/AuthContext";

export function RequireAuth() {
  const { session, loading, configOk } = useAuth();
  const location = useLocation();

  if (!configOk) {
    return (
      <div className="min-h-screen bg-bg-base text-text-primary flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-2">
          <h1 className="text-lg font-semibold">Supabase auth not configured</h1>
          <p className="text-sm text-text-secondary">
            Set <code className="font-mono text-xs">VITE_SUPABASE_URL</code> and{" "}
            <code className="font-mono text-xs">VITE_SUPABASE_ANON_KEY</code> in{" "}
            <code className="font-mono text-xs">.env.local</code>.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-bg-base flex items-center justify-center">
        <div className="text-sm text-text-secondary">Loading session…</div>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}
