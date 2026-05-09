/**
 * USD amounts as integer cents only — never use floats for money math in domain logic.
 */

/** Sum integer cents (overflow-safe for typical POS totals). */
export function sumCents(...values: number[]): number {
  let acc = 0;
  for (const v of values) {
    acc += v;
  }
  return acc;
}

/** Line total: unit price (cents) × quantity. */
export function lineSubtotalCents(unitPriceCents: number, qty: number): number {
  return unitPriceCents * qty;
}

/** Order subtotal from line items (all cents). */
export function orderSubtotalCents(order: {
  items: { priceCents: number; qty: number }[];
}): number {
  return sumCents(...order.items.map((i) => lineSubtotalCents(i.priceCents, i.qty)));
}

/**
 * Apply a percentage to cents (e.g. pct 8.25 → 8.25%).
 * Returns **half-up** integer cents via `Math.round` on the fractional product (not banker's rounding).
 */
export function applyPercent(cents: number, pct: number): number {
  return Math.round((cents * pct) / 100);
}

/**
 * Parse user-entered USD text into cents. Returns null if invalid or ambiguous.
 * Accepts forms like "12.99", "$12.99", "1,234.56".
 */
export function parseUSD(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const withoutCurrency = trimmed.replace(/^\s*\$\s*/, "").trim();
  const normalized = withoutCurrency.replace(/,/g, "");

  if (!/^-?\d*\.?\d*$/.test(normalized) || normalized === "" || normalized === ".") {
    return null;
  }

  const sign = normalized.startsWith("-") ? -1 : 1;
  const unsigned = normalized.replace(/^-/, "");

  const parts = unsigned.split(".");
  if (parts.length > 2) return null;

  const dollarsPart = parts[0] === "" ? "0" : parts[0];
  const centsPart = parts[1] ?? "";

  if (!/^\d*$/.test(dollarsPart) || !/^\d*$/.test(centsPart)) return null;

  if (centsPart.length > 2) return null;

  const fracDigits = centsPart.padEnd(2, "0").slice(0, 2);
  const dollars = Number.parseInt(dollarsPart, 10);
  const frac = Number.parseInt(fracDigits, 10);

  if (!Number.isFinite(dollars) || !Number.isFinite(frac)) return null;

  const cents = dollars * 100 + frac;
  return sign * cents;
}

/**
 * Format integer cents as USD (e.g. 1299 → "$12.99").
 * Negative cents render with a leading minus before the currency symbol.
 */
export function formatUSD(cents: number, options?: { sign?: boolean }): string {
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const dollars = abs / 100;

  const formatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(dollars);

  let prefix = "";
  if (negative) {
    prefix = "-";
  } else if (options?.sign && cents > 0) {
    prefix = "+";
  }

  return `${prefix}${formatted}`;
}
