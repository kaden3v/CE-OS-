import { describe, it, expect, beforeEach, vi } from "vitest";
import * as storage from "./storage";

describe("storage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("roundtrips JSON payloads under prefixed keys", () => {
    storage.set("demo", { x: 1 });
    expect(storage.get<{ x: number }>("demo")).toEqual({ x: 1 });
  });

  it("returns null when stored value is not valid JSON", () => {
    localStorage.setItem("ce-os:bad", "{not-json");
    expect(storage.get("bad")).toBeNull();
  });

  it("remove deletes the prefixed key", () => {
    storage.set("tmp", { a: true });
    storage.remove("tmp");
    expect(storage.get("tmp")).toBeNull();
  });

  it("subscribe runs when the prefixed storage key changes", () => {
    const cb = vi.fn();
    const unsub = storage.subscribe("syncKey", cb);
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "ce-os:syncKey",
        newValue: '"v"',
      })
    );
    expect(cb).toHaveBeenCalledTimes(1);
    unsub();
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "ce-os:syncKey",
        newValue: '"v2"',
      })
    );
    expect(cb).toHaveBeenCalledTimes(1);
  });
});
