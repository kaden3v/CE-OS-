import { describe, it, expect, beforeEach } from "vitest";
import {
  canDeleteCultivar,
  decrementStock,
  incrementStock,
  movementLog,
  resetInventoryModuleForTests,
} from "./inventory";

describe("inventory", () => {
  beforeEach(() => {
    resetInventoryModuleForTests();
  });

  describe("decrementStock", () => {
    it("refuses when result would be negative without override", () => {
      const r = decrementStock(5, 10, "SKU-1", "sale");
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toContain("negative");
      expect(movementLog).toHaveLength(0);
    });

    it("allows negative balance when reason starts with override:", () => {
      const r = decrementStock(5, 10, "SKU-1", "override:inventory correction");
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.qty).toBe(-5);
        expect(r.entry.balanceAfter).toBe(-5);
      }
      expect(movementLog).toHaveLength(1);
    });

    it("appends movement log with correct balanceAfter", () => {
      const r = decrementStock(20, 7, "SKU-2", "packed");
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.entry.balanceAfter).toBe(13);
        expect(r.entry.delta).toBe(-7);
        expect(movementLog[0]?.sku).toBe("SKU-2");
      }
    });
  });

  describe("incrementStock", () => {
    it("always succeeds for finite qty", () => {
      const r = incrementStock(3, 4, "SKU-3", "received");
      expect(r.ok).toBe(true);
      expect(r.qty).toBe(7);
      expect(movementLog[0]?.balanceAfter).toBe(7);
    });
  });

  describe("canDeleteCultivar", () => {
    it("returns blockers when inventory references exist", () => {
      const out = canDeleteCultivar("cv-12", [
        { scope: "inventory", cultivarId: "cv-12" },
      ]);
      expect(out.canDelete).toBe(false);
      expect(out.blockers).toContain("inventory:cv-12");
    });

    it("allows delete when no references", () => {
      expect(
        canDeleteCultivar("cv-12", [{ scope: "listing", cultivarId: "other" }])
          .canDelete
      ).toBe(true);
    });
  });
});
