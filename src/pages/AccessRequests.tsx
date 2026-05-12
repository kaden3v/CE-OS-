import { useEffect, useState, useCallback } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Check, X, ShieldCheck, RefreshCw, Mail, MessageSquare, Trash2 } from "lucide-react";
import { restGet, functionInvoke } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { useApp } from "@/contexts/AppContext";
import type { Tables } from "@/lib/database.types";

type Request = Tables<"access_requests">;
type Action = "approve" | "deny" | "revoke";

export default function AccessRequests() {
  const { session } = useAuth();
  const { addToast } = useApp();
  const [requests, setRequests] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"pending" | "all">("pending");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [denialReason, setDenialReason] = useState<Record<string, string>>({});

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await restGet<Request[]>("access_requests?select=*&order=requested_at.desc");
      setRequests(rows);
    } catch (err: any) {
      console.error("[access_requests.list]", err);
      addToast({ title: "Couldn't load requests", description: err?.message, status: "alert" });
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const callEdgeFunction = async (request_id: string, action: Action, denial_reason?: string) => {
    if (!session) {
      addToast({ title: "Not signed in", status: "alert" });
      return false;
    }
    const result = await functionInvoke<{ ok: boolean; error?: string }>("process-access-request", {
      request_id,
      action,
      denial_reason,
    });
    if (result.ok === false) {
      console.error("[edge fn] process-access-request:", result.status, result.error);
      addToast({ title: "Action failed", description: result.error, status: "alert" });
      return false;
    }
    return true;
  };

  const run = async (req: Request, action: Action, options?: { confirm?: string; reason?: string }) => {
    if (options?.confirm && !confirm(options.confirm)) return;
    setBusyId(req.id);
    const ok = await callEdgeFunction(req.id, action, options?.reason);
    setBusyId(null);
    if (ok) {
      const messages: Record<Action, string> = {
        approve: `${req.email} can now sign in`,
        deny: "Request denied — account removed",
        revoke: "Access revoked — account removed",
      };
      addToast({ title: messages[action], status: action === "approve" ? "ok" : "info" });
      setDenialReason((p) => {
        const n = { ...p };
        delete n[req.id];
        return n;
      });
      fetchRequests();
    }
  };

  const visible = filter === "pending" ? requests.filter((r) => r.status === "pending") : requests;

  return (
    <div className="p-8 max-w-5xl mx-auto h-full flex flex-col">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-accent-brand-dim border border-accent-brand/20 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-accent-brand" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold mb-1">Access Requests</h1>
            <p className="text-sm text-text-secondary">Approve to unlock the account so the requester can sign in with the password they chose. Deny removes the account entirely.</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={fetchRequests} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="flex gap-2 mb-6">
        {(["pending", "all"] as const).map((f) => (
          <Button key={f} size="sm" variant={filter === f ? "brand" : "outline"} onClick={() => setFilter(f)} className="capitalize">
            {f === "pending" ? "Open" : "All"}
            {f === "pending" && (
              <span className="ml-2 text-xs px-1.5 rounded bg-bg-active">
                {requests.filter((r) => r.status === "pending").length}
              </span>
            )}
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="text-text-secondary text-sm">Loading…</div>
      ) : visible.length === 0 ? (
        <Card className="p-12 flex flex-col items-center justify-center text-text-tertiary">
          <ShieldCheck className="w-8 h-8 mb-2 opacity-50" />
          <p className="text-sm">{filter === "pending" ? "Nothing waiting on you" : "No requests yet"}</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {visible.map((req) => {
            return (
              <Card key={req.id} className="p-5">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3 className="font-medium">{req.name ?? req.email}</h3>
                      {req.status === "pending" && (
                        <Badge variant="outline" className="text-status-warn border-status-warn/20">Pending</Badge>
                      )}
                      {req.status === "approved" && (
                        <Badge variant="brand">Active</Badge>
                      )}
                      {req.status === "denied" && (
                        <Badge variant="outline" className="text-status-alert border-status-alert/20">Denied</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-text-secondary">
                      <Mail className="w-3.5 h-3.5" />
                      {req.email}
                    </div>
                    {req.decided_at && (
                      <div className="text-xs text-text-tertiary mt-1">
                        Decided {new Date(req.decided_at).toLocaleString()}
                      </div>
                    )}
                  </div>
                  <div className="text-xs text-text-tertiary text-right whitespace-nowrap">
                    {new Date(req.requested_at).toLocaleString()}
                  </div>
                </div>

                {req.message && (
                  <div className="flex gap-2 p-3 rounded-md bg-bg-active border border-border-subtle text-sm text-text-secondary mb-4">
                    <MessageSquare className="w-4 h-4 mt-0.5 shrink-0 opacity-50" />
                    <p className="whitespace-pre-wrap">{req.message}</p>
                  </div>
                )}

                {req.status === "denied" && req.denial_reason && (
                  <div className="p-2 rounded-md bg-status-alert/10 border border-status-alert/20 text-xs text-status-alert mb-4">
                    Reason: {req.denial_reason}
                  </div>
                )}

                {/* Pending request → Approve / Deny */}
                {req.status === "pending" && (
                  <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
                    <Input
                      placeholder="Optional denial reason"
                      value={denialReason[req.id] ?? ""}
                      onChange={(e) => setDenialReason((p) => ({ ...p, [req.id]: e.target.value }))}
                      maxLength={500}
                      className="flex-1"
                      disabled={busyId === req.id}
                    />
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={() => run(req, "deny", { reason: denialReason[req.id] })}
                        disabled={busyId === req.id}
                        className="text-status-alert border-status-alert/20 hover:bg-status-alert/10"
                      >
                        <X className="w-4 h-4 mr-2" />
                        {busyId === req.id ? "…" : "Deny"}
                      </Button>
                      <Button variant="brand" onClick={() => run(req, "approve")} disabled={busyId === req.id}>
                        <Check className="w-4 h-4 mr-2" />
                        {busyId === req.id ? "…" : "Approve"}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Approved → Revoke (deletes the auth user) */}
                {req.status === "approved" && (
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => run(req, "revoke", { confirm: `Revoke access for ${req.email}? This deletes their account.` })}
                      disabled={busyId === req.id}
                      className="text-status-alert border-status-alert/20 hover:bg-status-alert/10"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      {busyId === req.id ? "…" : "Revoke access"}
                    </Button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
