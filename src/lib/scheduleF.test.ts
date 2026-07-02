import { describe, expect, test } from "vitest";
import {
  SCHEDULE_F_CATEGORIES,
  SCHEDULE_F_FALLBACK,
  EXPENSE_CATEGORY_TO_SCHEDULE_F,
  mapToScheduleF,
} from "./scheduleF";
import { EXPENSE_CATEGORIES } from "./scheduleC";

describe("mapToScheduleF", () => {
  test("maps every built-in app category cleanly", () => {
    for (const cat of EXPENSE_CATEGORIES) {
      const { scheduleF, mappedCleanly } = mapToScheduleF(cat);
      expect(mappedCleanly, `"${cat}" should map cleanly`).toBe(true);
      expect(SCHEDULE_F_CATEGORIES).toContain(scheduleF);
    }
  });

  test("normalizes case and whitespace", () => {
    expect(mapToScheduleF("  SHIPPING ")).toEqual({
      scheduleF: "Freight and trucking",
      mappedCleanly: true,
    });
  });

  test("shipping lands on Freight and trucking (not Other, unlike Schedule C)", () => {
    expect(mapToScheduleF("Shipping").scheduleF).toBe("Freight and trucking");
  });

  test("marketing and marketplace fees fall to Other expenses (no advertising/commissions line on F)", () => {
    expect(mapToScheduleF("Marketing").scheduleF).toBe("Other expenses");
    expect(mapToScheduleF("Marketplace fees").scheduleF).toBe("Other expenses");
  });

  test("permits and licenses land on Taxes", () => {
    expect(mapToScheduleF("Permits and licenses").scheduleF).toBe("Taxes");
  });

  test("unknown, null, and empty categories fall back without mapping cleanly", () => {
    for (const raw of ["Greenhouse snacks", null, undefined, ""]) {
      const { scheduleF, mappedCleanly } = mapToScheduleF(raw);
      expect(scheduleF).toBe(SCHEDULE_F_FALLBACK);
      expect(mappedCleanly).toBe(false);
    }
  });

  test("every mapping target is a real Schedule F line", () => {
    for (const line of Object.values(EXPENSE_CATEGORY_TO_SCHEDULE_F)) {
      expect(SCHEDULE_F_CATEGORIES).toContain(line);
    }
  });
});
