import { describe, expect, test } from "vitest";
import { classifyLedgerEntry, normalizeLedgerAmount } from "./etsy-ledger.ts";

describe("classifyLedgerEntry", () => {
  test("shipping labels → Shipping / Other expenses", () => {
    for (const d of ["Shipping label", "USPS Shipping Label", "Postage"]) {
      expect(classifyLedgerEntry(d, -550)).toEqual({ category: "Shipping", scheduleC: "Other expenses" });
    }
  });

  test("marketplace fees → Marketplace fees / Commissions and fees", () => {
    for (const d of ["Listing fee", "Transaction fee", "Processing fee", "Payment processing fee", "Regulatory operating fee"]) {
      expect(classifyLedgerEntry(d, -42)).toEqual({ category: "Marketplace fees", scheduleC: "Commissions and fees" });
    }
  });

  test("advertising → Marketing / Advertising (even when the text says 'fee')", () => {
    for (const d of ["Etsy Ads", "Offsite Ads fee", "Promoted listing"]) {
      expect(classifyLedgerEntry(d, -300)).toEqual({ category: "Marketing", scheduleC: "Advertising" });
    }
  });

  test("credits / transfers / tax are skipped (null)", () => {
    for (const d of ["Sale", "Deposit", "Payout", "Refund", "Sales tax", "Tax"]) {
      expect(classifyLedgerEntry(d, 1000)).toBeNull();
    }
  });

  test("unrecognized debit → uncategorized review bucket", () => {
    expect(classifyLedgerEntry("Mystery charge", -99)).toEqual({
      category: "Etsy fees (uncategorized)",
      scheduleC: "Commissions and fees",
    });
  });

  test("unrecognized credit (non-negative) → skipped", () => {
    expect(classifyLedgerEntry("Mystery credit", 99)).toBeNull();
  });

  test("sign is authoritative: a positive (refunded) fee is skipped, not booked as a cost", () => {
    expect(classifyLedgerEntry("Listing fee", 20)).toBeNull();
    expect(classifyLedgerEntry("Refund of shipping label", 550)).toBeNull();
  });
});

describe("normalizeLedgerAmount", () => {
  test("converts minor units to positive dollars", () => {
    expect(normalizeLedgerAmount(-550)).toBe(5.5);
    expect(normalizeLedgerAmount(1234)).toBe(12.34);
    expect(normalizeLedgerAmount(-99)).toBe(0.99);
  });
});
