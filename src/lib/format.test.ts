import { describe, it, expect, vi, afterEach } from "vitest";
import { formatMoney, formatDate, formatDateTime, formatRelative } from "@/lib/format";

describe("formatMoney", () => {
  it("formats positive numbers with thousands separators and 2dp", () => {
    expect(formatMoney(1234.5)).toBe("$1,234.50");
    expect(formatMoney(1000000)).toBe("$1,000,000.00");
    expect(formatMoney(0)).toBe("$0.00");
  });

  it("coerces numeric strings (Postgres numeric arrives as string/number)", () => {
    expect(formatMoney("12.5")).toBe("$12.50");
    expect(formatMoney("0.1")).toBe("$0.10");
  });

  it("treats null/undefined/empty as $0.00", () => {
    expect(formatMoney(null)).toBe("$0.00");
    expect(formatMoney(undefined)).toBe("$0.00");
    expect(formatMoney("")).toBe("$0.00");
  });

  it("falls back to $0.00 for non-numeric input instead of $NaN", () => {
    expect(formatMoney("abc")).toBe("$0.00");
    expect(formatMoney(NaN)).toBe("$0.00");
  });

  it("renders real negatives but never a -$0.00 artifact", () => {
    expect(formatMoney(-5)).toBe("$-5.00");
    expect(formatMoney(-1234.5)).toBe("$-1,234.50");
    // negative zero and sub-cent negatives normalize to a clean $0.00
    expect(formatMoney(-0)).toBe("$0.00");
    expect(formatMoney(-0.004)).toBe("$0.00");
    // a negative that rounds to a real cent still shows the sign
    expect(formatMoney(-0.006)).toBe("$-0.01");
  });
});

describe("formatDate / formatDateTime", () => {
  it("returns an em dash for empty or invalid input", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate(undefined)).toBe("—");
    expect(formatDate("not-a-date")).toBe("—");
    expect(formatDateTime(null)).toBe("—");
    expect(formatDateTime("not-a-date")).toBe("—");
  });

  it("formats a valid date without throwing", () => {
    const out = formatDate("2026-06-25T12:00:00.000Z");
    expect(out).not.toBe("—");
    expect(typeof out).toBe("string");
  });
});

describe("formatRelative", () => {
  afterEach(() => vi.useRealTimers());

  it("buckets elapsed time into just-now / minutes / hours / days", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-25T12:00:00.000Z"));
    const ago = (ms: number) => new Date(Date.now() - ms);
    expect(formatRelative(ago(30 * 1000))).toBe("just now");
    expect(formatRelative(ago(5 * 60 * 1000))).toBe("5m ago");
    expect(formatRelative(ago(90 * 60 * 1000))).toBe("1h ago");
    expect(formatRelative(ago(2 * 24 * 60 * 60 * 1000))).toBe("2d ago");
  });

  it("returns an em dash for empty/invalid input", () => {
    expect(formatRelative(null)).toBe("—");
    expect(formatRelative("nope")).toBe("—");
  });
});
