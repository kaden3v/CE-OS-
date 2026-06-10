import { useEffect, useMemo, useState } from "react";
import { Users, ShieldCheck, Trash2, Info } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { LoadingTable, EmptyState } from "@/components/ui/StateRenderer";
import { useAuth, type OrgRole } from "@/contexts/AuthContext";
import { useApp } from "@/contexts/AppContext";
import { useOrgMembers } from "@/hooks/useOrgMembers";
import { supabase } from "@/lib/supabase";
import { friendlyDbError } from "@/lib/dbErrors";

const ROLES: OrgRole[] = ["owner", "manager", "staff"];

const roleBadge = (role: OrgRole) =>
  role === "owner" ? "brand" : role === "manager" ? "outline" : "default";

export default function Team() {
  const { user, activeOrgId, orgRole, refreshOrg } = useAuth();
  const { addToast } = useApp();
  const { members, isLoading, updateRole, removeMember } = useOrgMembers();

  const [orgName, setOrgName] = useState<string>("");

  const canManage = orgRole === "owner" || orgRole === "manager";
  const ownerCount = useMemo(() => members.filter((m) => m.role === "owner").length, [members]);

  useEffect(() => {
    if (!supabase || !activeOrgId) return;
    let cancelled = false;
    supabase
      .from("organizations")
      .select("name")
      .eq("id", activeOrgId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled && data) setOrgName(data.name);
      });
    return () => {
      cancelled = true;
    };
  }, [activeOrgId]);

  const handleRoleChange = async (memberId: string, role: OrgRole) => {
    const result = await updateRole(memberId, role);
    if (!result.ok) {
      addToast({ title: "Couldn't change role", description: friendlyDbError({ code: result.code } as any), status: "alert" });
      return;
    }
    addToast({ title: "Role updated", status: "ok" });
    // If we changed our own role, refresh the cached role used for nav/route gating.
    const changed = members.find((m) => m.id === memberId);
    if (changed?.user_id === user?.id) await refreshOrg();
  };

  const handleRemove = async (memberId: string, name: string) => {
    if (!confirm(`Remove ${name} from this workspace? They will lose access to all shared data.`)) return;
    const result = await removeMember(memberId);
    if (!result.ok) {
      addToast({ title: "Couldn't remove member", description: friendlyDbError({ code: result.code } as any), status: "alert" });
      return;
    }
    addToast({ title: "Member removed", status: "info" });
  };

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-text-primary flex items-center gap-2">
            <Users className="w-5 h-5 text-text-secondary" /> Team
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            {orgName ? <>Members of <span className="text-text-primary font-medium">{orgName}</span>.</> : "Members of your workspace."}{" "}
            Everyone here shares the same orders, inventory, and records.
          </p>
        </div>
        {orgRole && (
          <Badge variant={roleBadge(orgRole)} className="mt-1">
            You: {orgRole}
          </Badge>
        )}
      </div>

      <Card>
        {isLoading ? (
          <div className="p-4">
            <LoadingTable rows={3} cols={3} />
          </div>
        ) : members.length === 0 ? (
          <EmptyState icon={Users} title="No members yet" description="Invite teammates by approving access requests." />
        ) : (
          <ul className="divide-y divide-border-subtle">
            {members.map((m) => {
              const isSelf = m.user_id === user?.id;
              const isLastOwner = m.role === "owner" && ownerCount <= 1;
              const name = m.displayName?.trim() || (isSelf ? "You" : "Unnamed member");
              return (
                <li key={m.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="w-8 h-8 rounded-full bg-bg-active border border-border-subtle flex items-center justify-center text-xs font-medium text-text-primary flex-shrink-0">
                    {(name[0] ?? "?").toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-text-primary truncate">
                      {name} {isSelf && <span className="text-text-tertiary">(you)</span>}
                    </div>
                    <div className="text-xs text-text-tertiary">
                      Joined {new Date(m.created_at).toLocaleDateString()}
                    </div>
                  </div>

                  {canManage && !isSelf ? (
                    <select
                      value={m.role}
                      disabled={isLastOwner}
                      onChange={(e) => handleRoleChange(m.id, e.target.value as OrgRole)}
                      className="bg-bg-base border border-border-strong rounded-md px-2 py-1 text-xs text-text-primary capitalize focus:outline-none focus:border-accent-brand disabled:opacity-50"
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Badge variant={roleBadge(m.role)} className="capitalize">
                      {m.role}
                    </Badge>
                  )}

                  {canManage && !isSelf && !isLastOwner && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove ${name}`}
                      onClick={() => handleRemove(m.id, name)}
                      className="text-text-tertiary hover:text-status-alert"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <div className="flex items-start gap-3 rounded-[12px] border border-border-subtle bg-bg-elevated/50 p-4 text-sm text-text-secondary">
        <Info className="w-4 h-4 mt-0.5 flex-shrink-0 text-text-tertiary" />
        <div className="space-y-1">
          <p>
            <span className="text-text-primary font-medium">Adding teammates:</span> have them open the sign-in page and
            choose <span className="text-text-primary">Request access</span>. An{" "}
            <span className="inline-flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5" /> admin</span> approves
            the request, which adds them to this workspace.
          </p>
          <p className="text-text-tertiary text-xs">
            Roles are advisory access tiers: <b>owner</b> manages the workspace and billing, <b>manager</b> can run
            operations and finances, <b>staff</b> handle day-to-day records.
          </p>
        </div>
      </div>
    </div>
  );
}
