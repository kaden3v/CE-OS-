import { describe, it, expect, beforeEach, vi } from "vitest";
import * as storage from "@/lib/storage";
import {
  CHANGELOG_RESOURCE_KEY,
  capDiffRecord,
  diffTuplesToSideRecords,
  loadChangeLogs,
  recordEntityCreate,
  recordEntityDelete,
  recordEntityUpdate,
} from "./changeLog";

describe("changeLog", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("caps oversized diffs with summary tuple", () => {
    // Enough keys that JSON.stringify(diff) exceeds CHANGELOG_MAX_BYTES (4096).
    const huge = Object.fromEntries(
      Array.from({ length: 800 }, (_, i) => [`k${i}`, [0, 1] as [unknown, unknown]])
    ) as Record<string, [unknown, unknown]>;
    const capped = capDiffRecord(huge);
    expect(String(capped.__summary?.[1])).toMatch(/large change/);
  });

  it("caps diff when JSON serialization fails", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const capped = capDiffRecord({
      x: [null, circular] as [unknown, unknown],
    });
    expect(String(capped.__summary?.[1])).toMatch(/serialization failed/);
  });

  it("diffTuplesToSideRecords splits tuples into before/after rows", () => {
    const { before, after } = diffTuplesToSideRecords({
      a: [1, 2],
      b: ["x", "y"],
    });
    expect(before).toEqual({ a: 1, b: "x" });
    expect(after).toEqual({ a: 2, b: "y" });
  });

  it("loadChangeLogs returns empty when envelope has no items array", () => {
    storage.set(CHANGELOG_RESOURCE_KEY, { version: 1 });
    expect(loadChangeLogs()).toEqual([]);
  });

  it("loadChangeLogs returns empty when items fail schema parse", () => {
    storage.set(CHANGELOG_RESOURCE_KEY, {
      version: 1,
      items: [{}],
    });
    expect(loadChangeLogs()).toEqual([]);
  });

  it("recordEntityUpdate and recordEntityDelete append entries", () => {
    recordEntityUpdate(
      "orders",
      { id: "a", q: 1 },
      { id: "a", q: 2 }
    );
    recordEntityDelete("orders", { id: "b" });
    const logs = loadChangeLogs();
    expect(logs.some((e) => e.action === "update")).toBe(true);
    expect(logs.some((e) => e.action === "delete")).toBe(true);
  });

  it("recordEntityCreate persists an envelope under the changelog key", () => {
    recordEntityCreate("orders", { id: "ORD-X", foo: "bar" });
    const raw = storage.get<{ version: number; items: unknown[] }>(
      CHANGELOG_RESOURCE_KEY
    );
    expect(raw?.items?.length).toBeGreaterThan(0);
    expect(loadChangeLogs().length).toBeGreaterThan(0);
  });
});
