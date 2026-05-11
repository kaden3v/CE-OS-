/**
 * Quarterly estimated tax — safe-harbor calculation.
 *
 * The IRS safe-harbor for self-employed taxpayers is:
 *   pay (whichever is least)
 *     a) 100% of last year's tax liability
 *        (110% if last year's AGI was > $150,000)
 *     b) 90% of this year's projected tax liability
 *
 * Then divide by 4 for the quarterly payment due.
 *
 * Projected tax is computed with a simplified blended self-employment +
 * income-tax estimate. It is intentionally conservative — the actual filing
 * is what gets paid; this estimate is just for cash-flow planning so quarters
 * aren't a surprise.
 */

export type SafeHarborInput = {
  /** Projected net profit YTD annualized, in cents. Caller computes this. */
  projectedNetProfitCents: number;
  /** Last year's tax liability (Form 1040 line 24), in cents. */
  priorYearTaxCents: number;
  /** Last year's AGI (Form 1040 line 11), in cents. Controls the 100% vs 110% rule. */
  priorYearAgiCents: number;
  /** Blended SE + federal income tax rate. Default 0.27 for a small Schedule C. */
  blendedRate?: number;
};

export type SafeHarborResult = {
  /** The lesser-of-two safe-harbor target for the YEAR (in cents). */
  annualSafeHarborCents: number;
  /** Which path was binding. */
  basis: 'prior-year' | 'current-year';
  /** Effective rate applied to prior-year tax (1.00 or 1.10). */
  priorYearMultiplier: number;
  /** Projected current-year tax (cents). */
  projectedAnnualTaxCents: number;
  /** Quarter payment due (annual / 4). */
  quarterlyPaymentCents: number;
  /** Human-readable explanation (for tooltips / drawer copy). */
  notes: string;
};

const HIGH_INCOME_THRESHOLD_CENTS = 150_000_00;

export function safeHarbor(input: SafeHarborInput): SafeHarborResult {
  const rate = input.blendedRate ?? 0.27;
  const projectedAnnualTax = Math.max(0, Math.round(input.projectedNetProfitCents * rate));

  const multiplier = input.priorYearAgiCents > HIGH_INCOME_THRESHOLD_CENTS ? 1.10 : 1.00;
  const priorYearTarget = Math.round(input.priorYearTaxCents * multiplier);
  const currentYearTarget = Math.round(projectedAnnualTax * 0.90);

  const useCurrentYear = currentYearTarget < priorYearTarget || input.priorYearTaxCents === 0;
  const annualSafeHarbor = useCurrentYear ? currentYearTarget : priorYearTarget;
  const quarter = Math.round(annualSafeHarbor / 4);

  const notes = useCurrentYear
    ? `Using 90% of projected current-year tax (${formatPct(0.90)} × ${formatCents(projectedAnnualTax)}). Lower than the prior-year safe harbor of ${formatCents(priorYearTarget)}.`
    : `Using ${formatPct(multiplier)} of prior-year tax. ${input.priorYearAgiCents > HIGH_INCOME_THRESHOLD_CENTS ? 'High-income rule applies (prior AGI > $150k).' : ''} Lower than 90% of projected current-year tax (${formatCents(currentYearTarget)}).`;

  return {
    annualSafeHarborCents: annualSafeHarbor,
    basis: useCurrentYear ? 'current-year' : 'prior-year',
    priorYearMultiplier: multiplier,
    projectedAnnualTaxCents: projectedAnnualTax,
    quarterlyPaymentCents: quarter,
    notes,
  };
}

function formatCents(c: number): string { return `$${(c / 100).toFixed(0)}`; }
function formatPct(p: number): string   { return `${(p * 100).toFixed(0)}%`; }

/**
 * Annualize a YTD net-profit number. If we've seen N months, project the
 * full year as (ytd / N) * 12. Simple linear extrapolation — good enough
 * for cash-flow planning.
 */
export function annualizeYtd(ytdCents: number, asOf: Date = new Date()): number {
  const month = asOf.getMonth() + 1; // 1..12
  if (month === 0) return ytdCents;
  return Math.round((ytdCents / month) * 12);
}
