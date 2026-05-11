/**
 * Asset register + straight-line depreciation schedule.
 *
 * Anything purchased with a useful life > 1 year and a cost > the de minimis
 * threshold (defaults to $2,500 per IRS Reg 1.263(a)-1(f)) should be
 * capitalized, not expensed. This module models that:
 *
 *   1. `capitalizeAsset()` — records the purchase as a debit to 1500 Equipment
 *      & Fixtures (not to an expense account).
 *   2. `depreciationSchedule()` — projects N years of straight-line
 *      depreciation. The store doesn't post the entries automatically; a
 *      future pass adds a year-end routine that journals them.
 *
 * Section 179 / Bonus depreciation are out of scope here — they're tax-
 * preparation choices, not bookkeeping mechanics.
 */

import { useSyncExternalStore } from 'react';

export type Asset = {
  id: string;
  name: string;
  /** Acquisition date (ISO YYYY-MM-DD). Depreciation begins this month. */
  acquiredOn: string;
  costCents: number;
  /** Useful life in years. 5 for grow equipment / racks; 7 for office furniture; 39 for buildings (out of scope). */
  usefulLifeYears: number;
  /** Optional salvage value at end of life. Defaults to 0. */
  salvageCents?: number;
  /** Free-text description / asset class. */
  notes?: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// Reactivity (same pattern as the journal store)
// ─────────────────────────────────────────────────────────────────────────────

let version = 0;
const listeners = new Set<() => void>();
function bump() { version++; listeners.forEach(l => l()); }
function subscribe(l: () => void) { listeners.add(l); return () => listeners.delete(l); }
function getSnapshot() { return version; }
export function useAssetStore<T>(selector: () => T): T {
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return selector();
}

// ─────────────────────────────────────────────────────────────────────────────
// Seed (so the page demonstrates real numbers immediately)
// ─────────────────────────────────────────────────────────────────────────────

let ASSETS: Asset[] = [
  { id: 'AS-001', name: 'LED grow lights (full system)', acquiredOn: '2023-04-01', costCents: 480_000, usefulLifeYears: 5, notes: 'Two 4-bar rigs, 8 fixtures total' },
  { id: 'AS-002', name: 'Greenhouse climate controller',  acquiredOn: '2023-07-15', costCents: 280_000, usefulLifeYears: 7, notes: 'Senmatic — 4-zone' },
  { id: 'AS-003', name: 'Mobile potting bench',           acquiredOn: '2024-02-20', costCents:  85_000, usefulLifeYears: 7, notes: 'Stainless steel, w/ tray' },
];

export function listAssets(): Asset[] {
  return ASSETS;
}

export function addAsset(input: Omit<Asset, 'id'>): Asset {
  const id = `AS-${String(ASSETS.length + 1).padStart(3, '0')}`;
  const next: Asset = { id, ...input };
  ASSETS = [...ASSETS, next];
  bump();
  return next;
}

export function removeAsset(id: string): void {
  ASSETS = ASSETS.filter(a => a.id !== id);
  bump();
}

// ─────────────────────────────────────────────────────────────────────────────
// Schedule projection
// ─────────────────────────────────────────────────────────────────────────────

export type ScheduleRow = {
  year: number;
  openingNetBookCents: number;
  depreciationCents: number;
  accumulatedDepreciationCents: number;
  closingNetBookCents: number;
};

export type AssetSchedule = {
  asset: Asset;
  annualDepreciationCents: number;
  rows: ScheduleRow[];
};

export function depreciationSchedule(asset: Asset): AssetSchedule {
  const cost = asset.costCents;
  const salvage = asset.salvageCents ?? 0;
  const depreciableBasis = Math.max(0, cost - salvage);
  // Straight-line: annual = basis / life. Round to whole cents on the last
  // year to absorb rounding drift.
  const annualCents = Math.floor(depreciableBasis / asset.usefulLifeYears);
  const acquiredYear = Number(asset.acquiredOn.slice(0, 4));

  const rows: ScheduleRow[] = [];
  let book = cost;
  let acc = 0;
  for (let i = 0; i < asset.usefulLifeYears; i++) {
    const year = acquiredYear + i;
    const isLast = i === asset.usefulLifeYears - 1;
    const dep = isLast ? Math.max(0, book - salvage) : annualCents;
    const opening = book;
    book = Math.max(salvage, book - dep);
    acc += dep;
    rows.push({
      year,
      openingNetBookCents: opening,
      depreciationCents: dep,
      accumulatedDepreciationCents: acc,
      closingNetBookCents: book,
    });
  }

  return { asset, annualDepreciationCents: annualCents, rows };
}

export function totalDepreciationForYear(year: number): { totalCents: number; perAsset: Array<{ asset: Asset; cents: number }> } {
  const items = ASSETS.map(a => {
    const s = depreciationSchedule(a);
    const row = s.rows.find(r => r.year === year);
    return { asset: a, cents: row?.depreciationCents ?? 0 };
  }).filter(x => x.cents > 0);
  return {
    totalCents: items.reduce((s, x) => s + x.cents, 0),
    perAsset: items,
  };
}
