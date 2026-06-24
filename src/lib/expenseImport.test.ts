import { describe, it, expect } from "vitest";
import { isInflow, passesPolarity } from "./expenseImport";

describe("isInflow", () => {
  it("treats a positive amount as money in", () => {
    expect(isInflow(12.5)).toBe(true);
  });
  it("treats zero, negatives, and null as not-inflow", () => {
    expect(isInflow(0)).toBe(false);
    expect(isInflow(-12.5)).toBe(false);
    expect(isInflow(null)).toBe(false);
  });
});

describe("passesPolarity", () => {
  it("'all' keeps both directions", () => {
    expect(passesPolarity("all", true)).toBe(true);
    expect(passesPolarity("all", false)).toBe(true);
  });
  it("'out' keeps outflows, drops inflows", () => {
    expect(passesPolarity("out", false)).toBe(true);
    expect(passesPolarity("out", true)).toBe(false);
  });
  it("'in' keeps inflows, drops outflows", () => {
    expect(passesPolarity("in", true)).toBe(true);
    expect(passesPolarity("in", false)).toBe(false);
  });
});
