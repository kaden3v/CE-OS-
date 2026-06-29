import { useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useOrgMembers } from "@/hooks/useOrgMembers";

/**
 * Map of `user_id → display name` for activity actors ("You" for the current
 * user). A null `actor_id` (system/automated writes) is handled separately by
 * `actorLabel`, which returns "System".
 */
export function useActorNames(): Map<string, string> {
  const { user } = useAuth();
  const { members } = useOrgMembers();
  return useMemo(() => {
    const map = new Map<string, string>();
    members.forEach((m) => {
      map.set(m.user_id, m.user_id === user?.id ? "You" : m.displayName?.trim() || "A teammate");
    });
    return map;
  }, [members, user?.id]);
}
