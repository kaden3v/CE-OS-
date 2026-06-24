import { describe, it, expect } from "vitest";
import { summarizeWrites } from "./writeSummary";

describe("summarizeWrites", () => {
  it("reports all-success with the given success status", () => {
    expect(summarizeWrites(5, 0, { verbPast: "categorized" })).toEqual({ title: "5 categorized", status: "ok" });
    expect(summarizeWrites(5, 0, { verbPast: "deleted", successStatus: "info" })).toEqual({
      title: "5 deleted",
      status: "info",
    });
  });

  it("warns on a partial failure", () => {
    expect(summarizeWrites(3, 2, { verbPast: "categorized" })).toEqual({
      title: "Categorized 3, 2 failed",
      status: "warn",
    });
  });

  it("alerts when nothing succeeded", () => {
    expect(summarizeWrites(0, 4, { verbPast: "re-categorized" })).toEqual({
      title: "Re-categorized 0, 4 failed",
      status: "alert",
    });
  });
});
