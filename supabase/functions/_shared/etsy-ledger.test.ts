import { describe, expect, test } from "vitest";
import { classifyLedgerEntry, normalizeLedgerAmount } from "./etsy-ledger.ts";

// Description codes + sign convention verified against a real 120-day ledger sample.
describe("classifyLedgerEntry", () => {
  test("shipping labels → Shipping / Other expenses (C) / Freight and trucking (F)", () => {
    for (const d of ["shipping_labels", "shipping_label_usps_adjustment"]) {
      expect(classifyLedgerEntry(d, -550)).toEqual({
        category: "Shipping",
        scheduleC: "Other expenses",
        scheduleF: "Freight and trucking",
      });
    }
  });

  test("marketplace fees → Marketplace fees / Commissions and fees (C) / Other expenses (F)", () => {
    for (const d of [
      "transaction", "transaction_quantity", "shipping_transaction",
      "renew_sold", "renew_sold_auto", "listing",
      "PAYMENT_PROCESSING_FEE", "buyer_fee", "tier_2_subscription", "tier_2_subscription_tax",
    ]) {
      expect(classifyLedgerEntry(d, -42)).toEqual({
        category: "Marketplace fees",
        scheduleC: "Commissions and fees",
        scheduleF: "Other expenses",
      });
    }
  });

  test("advertising → Marketing / Advertising (C) / Other expenses (F)", () => {
    for (const d of ["prolist", "offsite_ads_fee"]) {
      expect(classifyLedgerEntry(d, -300)).toEqual({
        category: "Marketing",
        scheduleC: "Advertising",
        scheduleF: "Other expenses",
      });
    }
  });

  test("shipping_transaction is a fee, NOT shipping postage", () => {
    expect(classifyLedgerEntry("shipping_transaction", -100)).toEqual({
      category: "Marketplace fees",
      scheduleC: "Commissions and fees",
      scheduleF: "Other expenses",
    });
  });

  test("payouts and pass-through sales tax are skipped even though negative", () => {
    expect(classifyLedgerEntry("DISBURSE2", -376167)).toBeNull();
    expect(classifyLedgerEntry("sales_tax", -55447)).toBeNull();
  });

  test("credits (non-negative) are skipped", () => {
    for (const d of ["PAYMENT_GROSS", "etsy_plus_credit", "shipping_label_usps_adjustment_credit"]) {
      expect(classifyLedgerEntry(d, 1000)).toBeNull();
    }
  });

  test("unrecognized charge → uncategorized review bucket", () => {
    expect(classifyLedgerEntry("mystery_code", -99)).toEqual({
      category: "Etsy fees (uncategorized)",
      scheduleC: "Commissions and fees",
      scheduleF: "Other expenses",
    });
  });
});

describe("normalizeLedgerAmount", () => {
  test("converts minor units to positive dollars", () => {
    expect(normalizeLedgerAmount(-222924)).toBe(2229.24);
    expect(normalizeLedgerAmount(-31431)).toBe(314.31);
    expect(normalizeLedgerAmount(1234)).toBe(12.34);
  });
});
