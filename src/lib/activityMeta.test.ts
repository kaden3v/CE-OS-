import { describe, it, expect } from "vitest";
import { actorLabel, snapshotFields, formatSnapshotValue, humanizeField } from "./activityMeta";

describe("actorLabel", () => {
  const names = new Map([["u-1", "You"], ["u-2", "Dana"]]);

  it("labels a null actor (automated/system write) as System", () => {
    expect(actorLabel(null, names)).toBe("System");
  });

  it("resolves a known member to their name", () => {
    expect(actorLabel("u-2", names)).toBe("Dana");
  });

  it("falls back to 'A teammate' for an unknown non-null actor", () => {
    expect(actorLabel("u-999", names)).toBe("A teammate");
  });
});

describe("snapshotFields", () => {
  it("picks the configured fields for a known entity, in order", () => {
    const row = { status: "shipped", channel: "etsy", total: 42, id: "x", org_id: "o" };
    expect(snapshotFields("orders", row)).toEqual([
      ["status", "shipped"],
      ["channel", "etsy"],
      ["total", 42],
    ]);
  });

  it("skips null and empty values", () => {
    const row = { status: "active", channel: null, total: "" };
    expect(snapshotFields("orders", row)).toEqual([["status", "active"]]);
  });

  it("uses a generic fallback for an unconfigured entity", () => {
    const row = { name: "Widget", quantity: 3, irrelevant: "skip" };
    expect(snapshotFields("supplies_unknown", row)).toEqual([
      ["name", "Widget"],
      ["quantity", 3],
    ]);
  });
});

describe("formatSnapshotValue", () => {
  it("formats money fields as currency", () => {
    expect(formatSnapshotValue("total", 42)).toBe("$42.00");
  });

  it("formats booleans as Yes/No", () => {
    expect(formatSnapshotValue("completed", true)).toBe("Yes");
    expect(formatSnapshotValue("deductible", false)).toBe("No");
  });

  it("passes plain values through as strings", () => {
    expect(formatSnapshotValue("status", "shipped")).toBe("shipped");
  });
});

describe("humanizeField", () => {
  it("turns a snake_case column into a readable label", () => {
    expect(humanizeField("tracking_number")).toBe("Tracking number");
    expect(humanizeField("status")).toBe("Status");
  });
});
