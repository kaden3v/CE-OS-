import type { Account } from './types';

/**
 * Chart of Accounts — Canyon Exotics nursery.
 *
 * Numbering convention:
 *   1xxx  Assets
 *   2xxx  Liabilities
 *   3xxx  Equity
 *   4xxx  Revenue
 *   5xxx  COGS
 *   6xxx  Operating expenses (Schedule C line items)
 *
 * Schedule C line numbers are 2024 form references. Update if the IRS revises.
 */

export const CHART_OF_ACCOUNTS: Account[] = [
  // ── Revenue ───────────────────────────────────────────────────────────────
  { code: '4000', name: 'Sales',                       type: 'revenue', active: true, scheduleC: '1' },
  { code: '4001', name: 'Sales — Shopify',             type: 'revenue', parent: '4000', active: true, scheduleC: '1' },
  { code: '4002', name: 'Sales — Etsy',                type: 'revenue', parent: '4000', active: true, scheduleC: '1' },
  { code: '4010', name: 'Returns & Refunds',           type: 'revenue', parent: '4000', active: true, scheduleC: '2' },

  // ── COGS ──────────────────────────────────────────────────────────────────
  { code: '5000', name: 'Cost of Goods Sold',          type: 'cogs',    active: true },
  { code: '5001', name: 'Plants & Seeds Purchased',    type: 'cogs',    parent: '5000', active: true, scheduleC: '36' },
  { code: '5010', name: 'Growing Media',               type: 'cogs',    parent: '5000', active: true, scheduleC: '36' },
  { code: '5020', name: 'Packaging Materials',         type: 'cogs',    parent: '5000', active: true, scheduleC: '38' },

  // ── Operating expenses — mapped to Schedule C Part II ────────────────────
  { code: '6010', name: 'Advertising',                 type: 'expense', active: true, scheduleC: '8'  },
  { code: '6020', name: 'Vehicle Expenses',            type: 'expense', active: true, scheduleC: '9'  },
  { code: '6030', name: 'Commissions & Fees',          type: 'expense', active: true, scheduleC: '10' }, // Etsy/Shopify fees
  { code: '6040', name: 'Contract Labor',              type: 'expense', active: true, scheduleC: '11' },
  { code: '6050', name: 'Depreciation',                type: 'expense', active: true, scheduleC: '13' },
  { code: '6060', name: 'Insurance',                   type: 'expense', active: true, scheduleC: '15' },
  { code: '6070', name: 'Interest — Other',            type: 'expense', active: true, scheduleC: '16b' },
  { code: '6080', name: 'Legal & Professional',        type: 'expense', active: true, scheduleC: '17' },
  { code: '6090', name: 'Office Expense',              type: 'expense', active: true, scheduleC: '18' },
  { code: '6100', name: 'Rent — Other Business Prop.', type: 'expense', active: true, scheduleC: '20b' },
  { code: '6110', name: 'Repairs & Maintenance',       type: 'expense', active: true, scheduleC: '21' },
  { code: '6120', name: 'Supplies',                    type: 'expense', active: true, scheduleC: '22' },
  { code: '6130', name: 'Taxes & Licenses',            type: 'expense', active: true, scheduleC: '23' },
  { code: '6140', name: 'Travel',                      type: 'expense', active: true, scheduleC: '24a' },
  { code: '6150', name: 'Meals (50% deductible)',      type: 'expense', active: true, scheduleC: '24b' },
  { code: '6160', name: 'Utilities',                   type: 'expense', active: true, scheduleC: '25' },
  { code: '6170', name: 'Shipping & Postage',          type: 'expense', active: true, scheduleC: '48' }, // Part V "Other"
  { code: '6180', name: 'Software & Subscriptions',    type: 'expense', active: true, scheduleC: '48' },
  { code: '6190', name: 'Bank & Payment Fees',         type: 'expense', active: true, scheduleC: '48' },
  { code: '6200', name: 'Home Office',                 type: 'expense', active: true, scheduleC: '30' },
  { code: '6900', name: 'Other Expenses',              type: 'expense', active: true, scheduleC: '48' },

  // ── Assets / Liabilities / Equity (minimal seeds) ────────────────────────
  { code: '1010', name: 'Operating Bank Account',      type: 'asset',   active: true },
  { code: '1020', name: 'Stripe Reserve',              type: 'asset',   active: true },
  { code: '1100', name: 'Inventory — Plants',          type: 'asset',   active: true },
  { code: '1500', name: 'Equipment & Fixtures',        type: 'asset',   active: true },
  { code: '1600', name: 'Accumulated Depreciation',    type: 'asset',   active: true },
  { code: '2010', name: 'Sales Tax Payable',           type: 'liability', active: true },
  { code: '2020', name: 'Accounts Payable',            type: 'liability', active: true },
  { code: '3010', name: 'Owner Equity',                type: 'equity',  active: true },
  { code: '3020', name: 'Owner Draw',                  type: 'equity',  active: true },
];

// ── Lookups ──────────────────────────────────────────────────────────────────
const BY_CODE = new Map(CHART_OF_ACCOUNTS.map(a => [a.code, a]));

export function accountByCode(code: string): Account | undefined {
  return BY_CODE.get(code);
}

export function accountName(code: string): string {
  return BY_CODE.get(code)?.name ?? code;
}

export function expenseAccounts(): Account[] {
  return CHART_OF_ACCOUNTS.filter(a => (a.type === 'expense' || a.type === 'cogs') && a.active && !!a.scheduleC);
}

// Smart category guess from a vendor name — used to pre-fill the GL account
// when the user types a vendor in the expense form. Conservative: only matches
// vendors we know about. Extend over time.
export function suggestAccountForVendor(vendor: string): string | null {
  const v = vendor.trim().toLowerCase();
  if (!v) return null;
  if (v.includes('usps') || v.includes('fedex') || v.includes('ups')) return '6170';
  if (v.includes('shopify')) return '6030';
  if (v.includes('etsy'))    return '6030';
  if (v.includes('stripe'))  return '6190';
  if (v.includes('amazon'))  return '6090';
  if (v.includes('home depot') || v.includes('lowes')) return '6120';
  if (v.includes('srp') || v.includes('aps') || v.includes('utility') || v.includes('electric')) return '6160';
  if (v.includes('cpa') || v.includes('accounting') || v.includes('lawyer') || v.includes('legal')) return '6080';
  if (v.includes('insurance')) return '6060';
  if (v.includes('sphagnum') || v.includes('moss') || v.includes('perlite') || v.includes('pumice')) return '5010';
  if (v.includes('nursery') || v.includes('carnivero') || v.includes('mountain crest')) return '5001';
  if (v.includes('dept of ag') || v.includes('permit') || v.includes('license')) return '6130';
  return null;
}
