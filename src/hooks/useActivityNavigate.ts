import { useCallback } from "react";
import { useNavigate } from "react-router";
import { useApp } from "@/contexts/AppContext";

/**
 * Deep-link from an activity event to the record it touched.
 *
 * Tiered by what each page supports today:
 *  - orders   → open the global order viewer (works from anywhere) + /orders
 *  - vendors  → the existing /finances/vendors/:id detail route
 *  - focus    → list page with `?focus=<id>` (page opens the row via useFocusParam)
 *  - other    → best-effort navigate to the entity's list page
 * Entities with no page (or a deleted record) simply aren't navigable.
 */
const LIST_ROUTE: Record<string, string> = {
  orders: "/orders",
  inventory: "/inventory",
  customers: "/customers",
  cultivars: "/cultivars",
  listings: "/listings",
  shipments: "/shipping",
  vendors: "/finances/vendors",
  expenses: "/finances/expenses",
  supplies: "/finances/supplies",
  subscriptions: "/finances/subscriptions",
  recurring_expenses: "/finances/subscriptions",
  mileage_log: "/finances/mileage",
  licenses: "/licenses",
  propagation_batches: "/propagation",
  print_jobs: "/shipping/print-queue",
  qr_codes: "/inventory/qr-codes",
};

// Pages that open a record detail from `?focus=<id>` via useFocusParam.
const FOCUS_ENTITIES = new Set(["inventory", "customers", "cultivars"]);

/** Where an event's record lives. `order` opens the global viewer; `path` is a
 *  route to navigate to; `null` means there's nowhere to go. Pure → unit-tested. */
export type RecordTarget = { kind: "order"; id: string } | { kind: "path"; path: string } | null;

export function activityRecordTarget(entity: string, entityId: string | null): RecordTarget {
  if (!entityId) return null;
  if (entity === "orders") return { kind: "order", id: entityId };
  if (entity === "vendors") return { kind: "path", path: `/finances/vendors/${entityId}` };
  const base = LIST_ROUTE[entity];
  if (!base) return null;
  return { kind: "path", path: FOCUS_ENTITIES.has(entity) ? `${base}?focus=${entityId}` : base };
}

/** Can we route to this record? (deleted events / unknown entities can't) */
export function canNavigateToRecord(entity: string, entityId: string | null): boolean {
  return activityRecordTarget(entity, entityId) !== null;
}

export function useActivityNavigate() {
  const navigate = useNavigate();
  const { setGlobalOrderViewId } = useApp();

  return useCallback(
    (entity: string, entityId: string | null) => {
      const target = activityRecordTarget(entity, entityId);
      if (!target) return;
      if (target.kind === "order") {
        setGlobalOrderViewId(target.id);
        navigate("/orders");
      } else {
        navigate(target.path);
      }
    },
    [navigate, setGlobalOrderViewId],
  );
}
