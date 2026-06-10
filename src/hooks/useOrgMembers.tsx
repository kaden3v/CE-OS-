import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth, type OrgRole } from "@/contexts/AuthContext";
import { logDbError } from "@/lib/dbErrors";

export type OrgMember = {
  /** org_memberships row id */
  id: string;
  user_id: string;
  role: OrgRole;
  created_at: string;
  displayName: string | null;
};

/**
 * Members of the current user's active organization.
 *
 * Display names come from a second query against `profiles` (visible to
 * co-members via the "profiles co-member read" RLS policy) rather than a
 * PostgREST embed, because org_memberships.user_id points at auth.users, not
 * public.profiles — there's no FK for PostgREST to resolve an embed through.
 */
export function useOrgMembers() {
  const { activeOrgId } = useAuth();
  const ready = !!supabase && !!activeOrgId;

  const [members, setMembers] = useState<OrgMember[]>([]);
  const [isLoading, setIsLoading] = useState(ready);

  const fetchAll = useCallback(async () => {
    if (!ready) return;
    setIsLoading(true);
    const { data: mems, error } = await supabase!
      .from("org_memberships")
      .select("id,user_id,role,created_at")
      .eq("org_id", activeOrgId!)
      .order("created_at", { ascending: true });
    if (error) {
      logDbError("fetch members", error);
      setIsLoading(false);
      return;
    }
    const rows = mems ?? [];
    const ids = rows.map((m) => m.user_id);
    const nameById = new Map<string, string | null>();
    if (ids.length > 0) {
      const { data: profs, error: profErr } = await supabase!
        .from("profiles")
        .select("id,display_name")
        .in("id", ids);
      if (profErr) logDbError("fetch member profiles", profErr);
      (profs ?? []).forEach((p) => nameById.set(p.id, p.display_name));
    }
    setMembers(
      rows.map((m) => ({
        id: m.id,
        user_id: m.user_id,
        role: m.role as OrgRole,
        created_at: m.created_at,
        displayName: nameById.get(m.user_id) ?? null,
      })),
    );
    setIsLoading(false);
  }, [ready, activeOrgId]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const updateRole = async (id: string, role: OrgRole): Promise<{ ok: boolean; code?: string }> => {
    if (!ready) return { ok: false, code: "NOT_READY" };
    const { error } = await supabase!
      .from("org_memberships")
      .update({ role })
      .eq("id", id)
      .eq("org_id", activeOrgId!);
    if (error) {
      logDbError("update member role", error);
      return { ok: false, code: error.code };
    }
    setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, role } : m)));
    return { ok: true };
  };

  const removeMember = async (id: string): Promise<{ ok: boolean; code?: string }> => {
    if (!ready) return { ok: false, code: "NOT_READY" };
    const { error } = await supabase!
      .from("org_memberships")
      .delete()
      .eq("id", id)
      .eq("org_id", activeOrgId!);
    if (error) {
      logDbError("remove member", error);
      return { ok: false, code: error.code };
    }
    setMembers((prev) => prev.filter((m) => m.id !== id));
    return { ok: true };
  };

  return { members, isLoading, updateRole, removeMember, refresh: fetchAll };
}
