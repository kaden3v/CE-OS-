import { describe, it, expect, vi, afterEach } from "vitest";
import {
  formatLocal,
  businessDaysFromNow,
  isShippingWindowSafe,
  parseLocalDateTime,
  parseLocalDate,
  daysBetween,
} from "./dates";

afterEach(() => {
  vi.useRealTimers();
});

describe("formatLocal", () => {
  it("shows the same UTC instant in different operator zones", () => {
    const iso = "2026-07-15T18:00:00.000Z";
    const phx = formatLocal(iso, "yyyy-MM-dd HH:mm", "America/Phoenix");
    const ny = formatLocal(iso, "yyyy-MM-dd HH:mm", "America/New_York");
    expect(phx).not.toBe(ny);
    expect(phx.startsWith("2026-07-15")).toBe(true);
    expect(ny.startsWith("2026-07-15")).toBe(true);
  });
});

describe("businessDaysFromNow", () => {
  it("skips weekends from a Phoenix Friday", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-06T19:00:00.000Z"));
    expect(businessDaysFromNow(1, "America/Phoenix")).toBe("2026-03-09");
  });

  it("skips weekends in America/Los_Angeles across DST season", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-13T19:00:00.000Z"));
    expect(businessDaysFromNow(1, "America/Los_Angeles")).toBe("2026-03-16");
  });
});

describe("isShippingWindowSafe", () => {
  it("July (heat): Monday safe, Thursday unsafe", () => {
    expect(isShippingWindowSafe("2026-07-06").safe).toBe(true);
    expect(isShippingWindowSafe("2026-07-09").safe).toBe(false);
  });

  it("January (cold): weekday safe, Saturday unsafe", () => {
    expect(isShippingWindowSafe("2026-01-05").safe).toBe(true);
    expect(isShippingWindowSafe("2026-01-10").safe).toBe(false);
  });
});

describe("parseLocalDate", () => {
  it("accepts valid civil YYYY-MM-DD", () => {
    expect(parseLocalDate("2028-01-10")).toBe("2028-01-10");
  });

  it("rejects impossible calendar dates", () => {
    expect(() => parseLocalDate("2026-02-30")).toThrow(RangeError);
  });
});

describe("daysBetween", () => {
  it("is zero for identical dates", () => {
    expect(daysBetween("2026-06-01", "2026-06-01")).toBe(0);
  });

  it("counts calendar days via UTC noon anchors", () => {
    expect(daysBetween("2026-06-01", "2026-06-04")).toBe(3);
  });
});

describe("parseLocalDateTime", () => {
  it("returns UTC ISO Z for Phoenix wall clock", () => {
    const z = parseLocalDateTime(
      "06/15/2026 3:30 PM",
      "MM/dd/yyyy h:mm a",
      "America/Phoenix"
    );
    expect(z.endsWith("Z")).toBe(true);
    expect(z).toBe("2026-06-15T22:30:00.000Z");
  });
});
