import { describe, it, expect } from "vitest";
import { parseCsv, parseCsvAmount, parseCsvDate } from "./csv";

describe("parseCsv", () => {
  it("parses a simple header + rows into string cells", () => {
    const rows = parseCsv("date,amount,memo\n2026-06-10,12.50,Soil\n2026-06-11,3.00,Tape");
    expect(rows).toEqual([
      ["date", "amount", "memo"],
      ["2026-06-10", "12.50", "Soil"],
      ["2026-06-11", "3.00", "Tape"],
    ]);
  });

  it("keeps commas inside quoted fields", () => {
    const rows = parseCsv('date,memo\n2026-06-10,"Soil, peat, and perlite"');
    expect(rows[1]).toEqual(["2026-06-10", "Soil, peat, and perlite"]);
  });

  it("unescapes doubled quotes inside a quoted field", () => {
    const rows = parseCsv('memo\n"He said ""hi"""');
    expect(rows[1]).toEqual(['He said "hi"']);
  });

  it("handles CRLF line endings", () => {
    const rows = parseCsv("a,b\r\n1,2\r\n");
    expect(rows).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("strips a leading UTF-8 BOM from the first cell", () => {
    const rows = parseCsv("﻿date,amount\n2026-06-10,5");
    expect(rows[0]).toEqual(["date", "amount"]);
  });

  it("drops fully blank rows", () => {
    const rows = parseCsv("a,b\n\n1,2\n   \n");
    expect(rows).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("parseCsvAmount", () => {
  it("parses a plain decimal", () => {
    expect(parseCsvAmount("12.50")).toBe(12.5);
  });

  it("strips currency symbols and thousands separators", () => {
    expect(parseCsvAmount("$1,234.56")).toBe(1234.56);
  });

  it("reads parenthesized amounts as negative", () => {
    expect(parseCsvAmount("(45.00)")).toBe(-45);
  });

  it("reads a leading minus as negative", () => {
    expect(parseCsvAmount("-12")).toBe(-12);
  });

  it("returns null for empty or non-numeric input", () => {
    expect(parseCsvAmount("")).toBeNull();
    expect(parseCsvAmount("n/a")).toBeNull();
    expect(parseCsvAmount("1.2.3")).toBeNull();
  });
});

describe("parseCsvDate", () => {
  it("passes through an ISO date (and trims a trailing time)", () => {
    expect(parseCsvDate("2026-06-10")).toBe("2026-06-10");
    expect(parseCsvDate("2026-06-10T14:00:00Z")).toBe("2026-06-10");
  });

  it("parses US M/D/Y with separators and zero-pads", () => {
    expect(parseCsvDate("6/9/2026")).toBe("2026-06-09");
    expect(parseCsvDate("06.09.2026")).toBe("2026-06-09");
  });

  it("expands a 2-digit year to 20xx", () => {
    expect(parseCsvDate("6/9/26")).toBe("2026-06-09");
  });

  it("rejects an out-of-range month (e.g. European D/M order)", () => {
    expect(parseCsvDate("13/01/2026")).toBeNull();
  });

  it("rejects impossible calendar dates instead of emitting them", () => {
    expect(parseCsvDate("02/30/2026")).toBeNull();
    expect(parseCsvDate("2026-02-30")).toBeNull();
    expect(parseCsvDate("04/31/2026")).toBeNull();
  });

  it("returns null for unparseable input", () => {
    expect(parseCsvDate("")).toBeNull();
    expect(parseCsvDate("not a date")).toBeNull();
  });
});
