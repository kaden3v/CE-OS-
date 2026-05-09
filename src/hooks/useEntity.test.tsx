import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { z } from "zod";
import { useEntity } from "@/hooks/useEntity";

vi.mock("@/lib/changeLog", () => ({
  recordEntityCreate: vi.fn(),
  recordEntityDelete: vi.fn(),
  recordEntityUpdate: vi.fn(),
}));

const hoisted = vi.hoisted(() => ({
  addToast: vi.fn(),
  registerStorageRecoveryIssue: vi.fn(),
}));

vi.mock("@/contexts/AppContext", () => ({
  useApp: () => hoisted,
}));

const WidgetSchema = z.object({
  id: z.string(),
  qty: z.number().int().nonnegative(),
});

type Widget = z.infer<typeof WidgetSchema>;

const SEED: Widget[] = [{ id: "w1", qty: 10 }];

describe("useEntity", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("schema validation rejects bad data on write", () => {
    const { result } = renderHook(() =>
      useEntity<Widget>("widgets", WidgetSchema, SEED)
    );
    act(() => {
      result.current.add({ qty: -1 } as Omit<Widget, "id">);
    });
    expect(hoisted.addToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Could not save",
        status: "alert",
      })
    );
    expect(result.current.items).toEqual(SEED);
  });

  it("malformed JSON falls back to seed and registers backup issue", () => {
    localStorage.setItem("ce-os:widgets", "{not json");
    renderHook(() => useEntity<Widget>("widgets", WidgetSchema, SEED));
    expect(hoisted.registerStorageRecoveryIssue).toHaveBeenCalledWith(
      "widgets",
      expect.stringMatching(/^backup:widgets:/)
    );
  });

  it("cross-tab storage event reloads items", async () => {
    const { result } = renderHook(() =>
      useEntity<Widget>("widgets", WidgetSchema, SEED)
    );
    await waitFor(() => expect(result.current.items[0]?.qty).toBe(10));

    const payload = JSON.stringify({
      version: 1,
      items: [{ id: "w1", qty: 42 }],
    });
    localStorage.setItem("ce-os:widgets", payload);
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "ce-os:widgets",
        newValue: payload,
      })
    );

    await waitFor(() => expect(result.current.items[0]?.qty).toBe(42));
  });

  it("add persists a valid row", () => {
    const { result } = renderHook(() =>
      useEntity<Widget>("widgets", WidgetSchema, SEED)
    );
    act(() => {
      result.current.add({ qty: 3 });
    });
    expect(result.current.items.some((x) => x.qty === 3)).toBe(true);
  });

  it("remove deletes by id", async () => {
    const { result } = renderHook(() =>
      useEntity<Widget>("widgets", WidgetSchema, SEED)
    );
    await waitFor(() =>
      expect(result.current.items.some((x) => x.id === "w1")).toBe(true)
    );
    act(() => {
      result.current.remove("w1");
    });
    expect(result.current.items.find((x) => x.id === "w1")).toBeUndefined();
  });

  it("reset restores seed data", () => {
    const { result } = renderHook(() =>
      useEntity<Widget>("widgets", WidgetSchema, SEED)
    );
    act(() => {
      result.current.add({ qty: 1 });
    });
    expect(result.current.items.length).toBeGreaterThan(SEED.length);
    act(() => {
      result.current.reset();
    });
    expect(result.current.items).toEqual(SEED);
  });

  it("update without async commit persists and records changelog", async () => {
    const { recordEntityUpdate } = await import("@/lib/changeLog");
    const { result } = renderHook(() =>
      useEntity<Widget>("widgets2", WidgetSchema, SEED)
    );
    await waitFor(() => expect(result.current.items[0]?.qty).toBe(10));
    act(() => {
      result.current.update("w1", { qty: 11 });
    });
    await waitFor(() => expect(result.current.items[0]?.qty).toBe(11));
    expect(recordEntityUpdate).toHaveBeenCalled();
  });

  it("update with successful async commit still records update", async () => {
    const { recordEntityUpdate } = await import("@/lib/changeLog");
    const { result } = renderHook(() =>
      useEntity<Widget>("widgets3", WidgetSchema, SEED)
    );
    await waitFor(() => expect(result.current.items[0]?.qty).toBe(10));
    await act(async () => {
      result.current.update("w1", { qty: 12 }, {
        commit: async () => {},
      });
    });
    await waitFor(() => expect(result.current.items[0]?.qty).toBe(12));
    expect(recordEntityUpdate).toHaveBeenCalled();
  });

  it("optimistic update rolls back on commit reject", async () => {
    const { result } = renderHook(() =>
      useEntity<Widget>("widgets", WidgetSchema, SEED)
    );
    await waitFor(() => expect(result.current.items[0]?.qty).toBe(10));

    await act(async () => {
      result.current.update(
        "w1",
        { qty: 99 },
        {
          commit: async () => {
            throw new Error("sync failed");
          },
        }
      );
    });

    await waitFor(() => expect(result.current.items[0]?.qty).toBe(10));
    expect(hoisted.addToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Could not sync",
        status: "alert",
      })
    );
  });
});
