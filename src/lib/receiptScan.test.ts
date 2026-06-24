import { describe, it, expect } from "vitest";
import { draftFromFilename, scanReceipt } from "./receiptScan";

describe("draftFromFilename", () => {
  it("pulls an ISO date and a decimal amount", () => {
    expect(draftFromFilename("receipt_2026-06-21_42.18.pdf")).toEqual({
      amount: 42.18,
      occurred_on: "2026-06-21",
    });
  });

  it("reads a US date and a $-prefixed amount", () => {
    expect(draftFromFilename("HomeDepot $54.30 06-21-2026.jpg")).toEqual({
      amount: 54.3,
      occurred_on: "2026-06-21",
    });
  });

  it("does NOT treat a plain integer filename as an amount", () => {
    expect(draftFromFilename("IMG_4218.jpg")).toEqual({ amount: null, occurred_on: null });
  });

  it("returns nulls when nothing is recognizable", () => {
    expect(draftFromFilename("scan.pdf")).toEqual({ amount: null, occurred_on: null });
  });

  it("takes the last decimal amount (totals usually trail)", () => {
    expect(draftFromFilename("12.00_tip_88.50.png").amount).toBe(88.5);
  });

  it("reads thousands-separated totals without dropping the leading group (no 10x error)", () => {
    expect(draftFromFilename("receipt_$1,234.56_2026-06-21.pdf")).toEqual({
      amount: 1234.56,
      occurred_on: "2026-06-21",
    });
  });

  it("still reads plain large amounts with no separators", () => {
    expect(draftFromFilename("invoice_1234.56.pdf").amount).toBe(1234.56);
  });

  it("parses single-digit ISO month/day by zero-padding", () => {
    expect(draftFromFilename("2026-6-2.jpg").occurred_on).toBe("2026-06-02");
    expect(draftFromFilename("scan_2026_6_21.png").occurred_on).toBe("2026-06-21");
  });
});

describe("scanReceipt", () => {
  it("labels a recognizable filename as a mocked 'filename' draft", async () => {
    const d = await scanReceipt(new File([""], "receipt_2026-06-21_42.18.pdf"));
    expect(d).toEqual({ amount: 42.18, occurred_on: "2026-06-21", vendor_name: null, source: "filename", mocked: true });
  });

  it("labels an unrecognizable filename as 'none' (drives the modal's 'add details' copy)", async () => {
    const d = await scanReceipt(new File([""], "scan.pdf"));
    expect(d).toEqual({ amount: null, occurred_on: null, vendor_name: null, source: "none", mocked: true });
  });
});
