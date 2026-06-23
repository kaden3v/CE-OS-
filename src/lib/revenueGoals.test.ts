import { describe, expect, test } from "vitest";
import { computeGoalPace, inclusiveDaySpan, periodBounds, type PaceInput } from "./revenueGoals";

// A June (30-day month) base case, 15 days elapsed (the 1st..15th inclusive).
const baseMonth: PaceInput = {
  target: 3000,
  actualNet: 1500,
  actualGross: 1700,
  priorNet: 1200,
  periodStartISO: "2026-06-01",
  periodEndISO: "2026-06-30",
  todayISO: "2026-06-15",
};

describe("inclusiveDaySpan", () => {
  test("counts both endpoints", () => {
    expect(inclusiveDaySpan("2026-06-01", "2026-06-01")).toBe(1);
    expect(inclusiveDaySpan("2026-06-01", "2026-06-30")).toBe(30);
    expect(inclusiveDaySpan("2026-01-01", "2026-12-31")).toBe(365);
  });

  test("handles a leap year", () => {
    expect(inclusiveDaySpan("2024-01-01", "2024-12-31")).toBe(366);
  });
});

describe("periodBounds", () => {
  test("month bounds cover the whole calendar month", () => {
    // (date-dependent on Phoenix today, so only assert shape + ordering)
    const { startISO, endISO } = periodBounds("month");
    expect(startISO).toMatch(/^\d{4}-\d{2}-01$/);
    expect(endISO >= startISO).toBe(true);
    expect(inclusiveDaySpan(startISO, endISO)).toBeGreaterThanOrEqual(28);
    expect(inclusiveDaySpan(startISO, endISO)).toBeLessThanOrEqual(31);
  });

  test("ytd bounds span Jan 1 to Dec 31", () => {
    const { startISO, endISO } = periodBounds("ytd");
    expect(startISO).toMatch(/^\d{4}-01-01$/);
    expect(endISO).toMatch(/^\d{4}-12-31$/);
  });
});

describe("computeGoalPace", () => {
  test("on track when actuals keep linear pace with the target", () => {
    // 1500 in 15 of 30 days → projects to 3000 == target.
    const r = computeGoalPace(baseMonth);
    expect(r.hasGoal).toBe(true);
    expect(r.daysElapsed).toBe(15);
    expect(r.daysInPeriod).toBe(30);
    expect(r.daysRemaining).toBe(15);
    expect(r.projectedNet).toBeCloseTo(3000, 5);
    expect(r.status).toBe("on_track");
    expect(r.goalFraction).toBeCloseTo(0.5, 5);
    expect(r.timeFraction).toBeCloseTo(0.5, 5);
  });

  test("behind when the projection falls short of the target", () => {
    const r = computeGoalPace({ ...baseMonth, actualNet: 900 });
    // 900 / 15 * 30 = 1800 < 3000
    expect(r.projectedNet).toBeCloseTo(1800, 5);
    expect(r.status).toBe("behind");
    expect(r.neededTotal).toBe(2100); // 3000 - 900
    expect(r.neededPerDay).toBeCloseTo(2100 / 15, 5);
  });

  test("ahead when the projection comfortably beats the target", () => {
    const r = computeGoalPace({ ...baseMonth, actualNet: 2000 });
    // 2000 / 15 * 30 = 4000 ≥ 3000 * 1.02
    expect(r.projectedNet).toBeCloseTo(4000, 5);
    expect(r.status).toBe("ahead");
  });

  test("no_goal when target is null or zero", () => {
    expect(computeGoalPace({ ...baseMonth, target: null }).status).toBe("no_goal");
    expect(computeGoalPace({ ...baseMonth, target: 0 }).hasGoal).toBe(false);
    // Projection is still computed so the UI can show a run-rate without a goal.
    expect(computeGoalPace({ ...baseMonth, target: null }).projectedNet).toBeCloseTo(3000, 5);
  });

  test("needed amounts clamp to zero once the goal is already met", () => {
    const r = computeGoalPace({ ...baseMonth, actualNet: 3200 });
    expect(r.neededTotal).toBe(0);
    expect(r.neededPerDay).toBe(0);
    expect(r.status).toBe("ahead");
  });

  test("vsPriorPct compares PROJECTED full period to the prior full period (like-for-like)", () => {
    const r = computeGoalPace(baseMonth);
    // projectedNet = 1500/15*30 = 3000; prior = 1200 → +150%, not the partial 1500-vs-1200.
    expect(r.projectedNet).toBeCloseTo(3000, 5);
    expect(r.vsPriorPct).toBeCloseTo((3000 - 1200) / 1200, 5); // +150%
  });

  test("vsPriorPct is null when there is no prior revenue", () => {
    expect(computeGoalPace({ ...baseMonth, priorNet: null }).vsPriorPct).toBeNull();
    expect(computeGoalPace({ ...baseMonth, priorNet: 0 }).vsPriorPct).toBeNull();
  });

  test("last day of the period leaves nothing to pace and no division by zero", () => {
    const r = computeGoalPace({ ...baseMonth, actualNet: 2400, todayISO: "2026-06-30" });
    expect(r.daysElapsed).toBe(30);
    expect(r.daysRemaining).toBe(0);
    expect(r.neededPerDay).toBe(0); // can't earn more this period
    expect(r.projectedNet).toBeCloseTo(2400, 5); // projection == actual at period end
  });

  test("first day of the period treats elapsed as one day", () => {
    const r = computeGoalPace({ ...baseMonth, actualNet: 100, todayISO: "2026-06-01" });
    expect(r.daysElapsed).toBe(1);
    expect(r.projectedNet).toBeCloseTo(3000, 5); // 100 * 30
  });

  test("projection is low-confidence early in the period and confident past the threshold", () => {
    // Day 3 of a 30-day month → 10% elapsed → not yet trustworthy.
    expect(computeGoalPace({ ...baseMonth, actualNet: 300, todayISO: "2026-06-03" }).confident).toBe(false);
    // Day 15 → 50% elapsed → confident.
    expect(computeGoalPace(baseMonth).confident).toBe(true);
    // A single early big order would project sky-high but must not be asserted confidently.
    const early = computeGoalPace({ ...baseMonth, actualNet: 1000, todayISO: "2026-06-02" });
    expect(early.confident).toBe(false);
    expect(early.status).toBe("ahead"); // status still computed; UI suppresses it until confident
  });

  test("annual period projects across the full year", () => {
    const r = computeGoalPace({
      target: 73000,
      actualNet: 18250,
      actualGross: 20000,
      priorNet: 60000,
      periodStartISO: "2026-01-01",
      periodEndISO: "2026-12-31",
      todayISO: "2026-04-01", // 91 days elapsed in a 365-day year
    });
    expect(r.daysInPeriod).toBe(365);
    expect(r.daysElapsed).toBe(91);
    expect(r.projectedNet).toBeCloseTo((18250 / 91) * 365, 3);
  });
});
