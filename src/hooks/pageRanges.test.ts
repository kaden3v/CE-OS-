import { describe, it, expect } from "vitest";
import { pageRanges } from "@/hooks/pageRanges";

describe("pageRanges", () => {
  it("produces full 1000-row pages up to the default 50k ceiling", () => {
    const ranges = pageRanges(50000, 1000);
    expect(ranges.length).toBe(50);
    expect(ranges[0]).toEqual([0, 999]);
    expect(ranges[1]).toEqual([1000, 1999]);
    expect(ranges[49]).toEqual([49000, 49999]);
  });

  it("caps the final page at the ceiling when it is not a multiple of pageSize", () => {
    // The off-by-one that would silently truncate financial data if wrong.
    expect(pageRanges(2500, 1000)).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2499],
    ]);
  });

  it("returns a single page when ceiling equals pageSize", () => {
    expect(pageRanges(1000, 1000)).toEqual([[0, 999]]);
  });

  it("returns one partial page when ceiling is smaller than pageSize", () => {
    expect(pageRanges(300, 1000)).toEqual([[0, 299]]);
  });

  it("returns no pages for a zero ceiling", () => {
    expect(pageRanges(0, 1000)).toEqual([]);
  });

  it("guards against a non-positive page size instead of looping forever", () => {
    expect(pageRanges(5000, 0)).toEqual([]);
    expect(pageRanges(5000, -1)).toEqual([]);
  });
});
