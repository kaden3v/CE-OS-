import { describe, it, expect } from "vitest";
import { activityRecordTarget, canNavigateToRecord } from "./useActivityNavigate";

describe("activityRecordTarget", () => {
  it("routes orders to the global order viewer", () => {
    expect(activityRecordTarget("orders", "ord-1")).toEqual({ kind: "order", id: "ord-1" });
  });

  it("routes vendors to their detail route", () => {
    expect(activityRecordTarget("vendors", "v-9")).toEqual({ kind: "path", path: "/finances/vendors/v-9" });
  });

  it("routes focus entities to the list page with a ?focus= deep-link", () => {
    expect(activityRecordTarget("inventory", "inv-3")).toEqual({ kind: "path", path: "/inventory?focus=inv-3" });
    expect(activityRecordTarget("customers", "c-2")).toEqual({ kind: "path", path: "/customers?focus=c-2" });
  });

  it("routes non-focus entities to their list page without a focus param", () => {
    expect(activityRecordTarget("shipments", "s-1")).toEqual({ kind: "path", path: "/shipping" });
  });

  it("returns null when there is no entity id (e.g. a deleted bulk action)", () => {
    expect(activityRecordTarget("orders", null)).toBeNull();
  });

  it("returns null for an entity with no page", () => {
    expect(activityRecordTarget("mortality_events", "m-1")).toBeNull();
  });
});

describe("canNavigateToRecord", () => {
  it("is true for known entities with an id, false otherwise", () => {
    expect(canNavigateToRecord("orders", "ord-1")).toBe(true);
    expect(canNavigateToRecord("vendors", "v-1")).toBe(true);
    expect(canNavigateToRecord("orders", null)).toBe(false);
    expect(canNavigateToRecord("unknown_table", "x-1")).toBe(false);
  });
});
