import { describe, it, expect } from "vitest";
import {
  applyPercent,
  formatUSD,
  parseUSD,
  sumCents,
} from "./money";

describe("formatUSD", () => {
  it("formats zero", () => {
    expect(formatUSD(0)).toBe("$0.00");
  });

  it("formats thousands with grouping", () => {
    expect(formatUSD(123_456)).toBe("$1,234.56");
  });

  it("puts minus before currency for negative cents", () => {
    expect(formatUSD(-1299)).toMatch(/^-\$12\.99$/);
  });

  it("optional plus prefix for positive values", () => {
    expect(formatUSD(100, { sign: true })).toMatch(/^\+\$/);
  });
});

describe("parseUSD", () => {
  it("parses dollar-prefixed cents", () => {
    expect(parseUSD("$12.99")).toBe(1299);
  });

  it("parses grouped digits", () => {
    expect(parseUSD("1,234.56")).toBe(123_456);
  });

  it("returns null for empty input", () => {
    expect(parseUSD("")).toBe(null);
    expect(parseUSD("   ")).toBe(null);
  });

  it("returns null for non-numeric garbage", () => {
    expect(parseUSD("abc")).toBe(null);
  });
});

describe("sumCents", () => {
  it("sums arbitrary lists including negatives", () => {
    expect(sumCents(100, -50, 25)).toBe(75);
    expect(sumCents()).toBe(0);
  });
});

describe("applyPercent", () => {
  /** Half-up via Math.round on fractional cents (documented on {@link applyPercent}). */
  it("rounds half-up toward nearest cent", () => {
    expect(applyPercent(100, 8.255)).toBe(8);
    expect(applyPercent(33, 33.33)).toBe(11);
    expect(applyPercent(1, 50)).toBe(1);
  });
});
