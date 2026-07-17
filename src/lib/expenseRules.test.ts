import { describe, expect, test } from "vitest";
import { applyRules, describeRule, matchesRule, sortRules, type ExpenseRuleFields } from "./expenseRules";

const rule = (over: Partial<ExpenseRuleFields> = {}): ExpenseRuleFields => ({
  id: "r1",
  active: true,
  priority: 100,
  match_field: "any",
  match_value: "amzn",
  amount_min: null,
  amount_max: null,
  set_category: "Supplies",
  set_vendor_id: null,
  mark_reviewed: true,
  ...over,
});

const target = (over: Partial<{ description: string | null; vendor_name: string | null; amount: number }> = {}) => ({
  description: "AMZN Mktp US*2X3Y" as string | null,
  vendor_name: null as string | null,
  amount: 25.99,
  ...over,
});

describe("matchesRule", () => {
  test("matches case-insensitively in the memo", () => {
    expect(matchesRule(rule(), target())).toBe(true);
  });

  test("matches in the vendor label when field is vendor", () => {
    const r = rule({ match_field: "vendor", match_value: "home depot" });
    expect(matchesRule(r, target({ vendor_name: "The Home Depot #1234" }))).toBe(true);
    expect(matchesRule(r, target({ vendor_name: null }))).toBe(false);
  });

  test("memo-only rule ignores the vendor label", () => {
    const r = rule({ match_field: "memo", match_value: "depot" });
    expect(matchesRule(r, target({ description: null, vendor_name: "Home Depot" }))).toBe(false);
  });

  test("any matches either memo or vendor", () => {
    const r = rule({ match_field: "any", match_value: "depot" });
    expect(matchesRule(r, target({ description: null, vendor_name: "Home Depot" }))).toBe(true);
    expect(matchesRule(r, target({ description: "HOME DEPOT #22", vendor_name: null }))).toBe(true);
  });

  test("collapses whitespace before matching", () => {
    const r = rule({ match_value: "home depot" });
    expect(matchesRule(r, target({ description: "HOME    DEPOT" }))).toBe(true);
  });

  test("inactive rules never match", () => {
    expect(matchesRule(rule({ active: false }), target())).toBe(false);
  });

  test("blank match_value never matches", () => {
    expect(matchesRule(rule({ match_value: "   " }), target())).toBe(false);
  });

  test("amount bounds are inclusive", () => {
    const r = rule({ amount_min: 10, amount_max: 25.99 });
    expect(matchesRule(r, target({ amount: 25.99 }))).toBe(true);
    expect(matchesRule(r, target({ amount: 10 }))).toBe(true);
    expect(matchesRule(r, target({ amount: 9.99 }))).toBe(false);
    expect(matchesRule(r, target({ amount: 26 }))).toBe(false);
  });

  test("numeric-string bounds (as Postgres returns numerics) are honored", () => {
    const r = rule({ amount_min: "10.00", amount_max: "30.00" });
    expect(matchesRule(r, target({ amount: 20 }))).toBe(true);
    expect(matchesRule(r, target({ amount: 31 }))).toBe(false);
  });
});

describe("applyRules", () => {
  test("first match in priority order wins", () => {
    const low = rule({ id: "b", priority: 10, set_category: "Marketing" });
    const high = rule({ id: "a", priority: 200, set_category: "Supplies" });
    expect(applyRules([high, low], target())?.set_category).toBe("Marketing");
  });

  test("ties on priority break deterministically by id", () => {
    const a = rule({ id: "a", priority: 50, set_category: "A" });
    const b = rule({ id: "b", priority: 50, set_category: "B" });
    expect(applyRules([b, a], target())?.set_category).toBe("A");
  });

  test("skips inactive and non-matching rules", () => {
    const off = rule({ id: "a", priority: 1, active: false });
    const miss = rule({ id: "b", priority: 2, match_value: "starbucks" });
    const hit = rule({ id: "c", priority: 3 });
    expect(applyRules([off, miss, hit], target())?.id).toBe("c");
  });

  test("returns null when nothing matches", () => {
    expect(applyRules([rule({ match_value: "uber" })], target())).toBeNull();
  });

  test("does not mutate the input array", () => {
    const rules = [rule({ id: "b", priority: 2 }), rule({ id: "a", priority: 1 })];
    const before = rules.map((r) => r.id);
    applyRules(rules, target());
    expect(rules.map((r) => r.id)).toEqual(before);
  });
});

describe("sortRules", () => {
  test("orders by priority then id without mutating", () => {
    const input = [rule({ id: "z", priority: 5 }), rule({ id: "a", priority: 5 }), rule({ id: "m", priority: 1 })];
    const sorted = sortRules(input);
    expect(sorted.map((r) => r.id)).toEqual(["m", "a", "z"]);
    expect(input.map((r) => r.id)).toEqual(["z", "a", "m"]);
  });
});

describe("describeRule", () => {
  test("reads naturally for each field", () => {
    expect(describeRule(rule())).toBe("memo or vendor contains “amzn” → Supplies");
    expect(describeRule(rule({ match_field: "memo" }))).toContain("memo contains");
    expect(describeRule(rule({ match_field: "vendor" }))).toContain("vendor contains");
  });
});
