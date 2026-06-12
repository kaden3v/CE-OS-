import { describe, it, expect } from "vitest";
import { isoYear, formatBusinessDate, businessMonthShort, toBusinessISODate, todayISO } from "./dates";

describe("Phoenix timezone date handling", () => {
  it("reads a date-only year literally (no UTC shift)", () => {
    // The UTC bug: new Date('2026-01-01').getFullYear() is 2025 west of UTC.
    expect(isoYear("2026-01-01")).toBe(2026);
    expect(isoYear("2026-12-31")).toBe(2026);
  });

  it("resolves a timestamp's year in Phoenix, not UTC", () => {
    // 2026-01-01T01:00:00Z is still 2025-12-31 18:00 in Phoenix (UTC-7).
    expect(isoYear("2026-01-01T01:00:00Z")).toBe(2025);
  });

  it("does not shift a date-only string when formatting", () => {
    // A bare YYYY-MM-DD must render as that calendar day, not the day before.
    expect(formatBusinessDate("2026-06-10")).toBe(new Date(2026, 5, 10).toLocaleDateString());
  });

  it("converts a timestamp to the Phoenix calendar date", () => {
    // Evening-UTC instant rolls back a day in Phoenix.
    expect(toBusinessISODate("2026-06-11T01:00:00Z")).toBe("2026-06-10");
    // A bare date passes through unchanged.
    expect(toBusinessISODate("2026-06-11")).toBe("2026-06-11");
  });

  it("buckets months without boundary drift", () => {
    expect(businessMonthShort("2026-07-01")).toBe("Jul");
    expect(businessMonthShort("2026-12-31")).toBe("Dec");
  });

  it("todayISO returns a well-formed Phoenix calendar date", () => {
    expect(todayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
