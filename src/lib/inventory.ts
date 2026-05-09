import { utcIsoNow } from "@/lib/dates";

export type MovementEntry = {
  id: string;
  sku: string;
  delta: number;
  reason: string;
  balanceAfter: number;
  at: string;
};

/** In-memory movement log for tests and future persistence wiring. */
export const movementLog: MovementEntry[] = [];

let seq = 0;

export function resetInventoryModuleForTests(): void {
  movementLog.length = 0;
  seq = 0;
}

function uid(): string {
  seq += 1;
  return `mov-${seq}`;
}

export type DecrementResult =
  | { ok: true; qty: number; entry: MovementEntry }
  | { ok: false; error: string };

/**
 * Decrement stock; refuses negative balances unless `reason` starts with `override:`.
 */
export function decrementStock(
  currentQty: number,
  qty: number,
  sku: string,
  reason: string,
  clock: () => string = utcIsoNow
): DecrementResult {
  if (!Number.isFinite(qty) || qty <= 0) {
    return { ok: false, error: "qty must be a positive finite number" };
  }
  const override = reason.startsWith("override:");
  const next = currentQty - qty;
  if (!override && next < 0) {
    return { ok: false, error: "would go negative" };
  }
  const balanceAfter = next;
  const entry: MovementEntry = {
    id: uid(),
    sku,
    delta: -qty,
    reason,
    balanceAfter,
    at: clock(),
  };
  movementLog.push(entry);
  return { ok: true, qty: balanceAfter, entry };
}

export type IncrementResult = { ok: true; qty: number; entry: MovementEntry };

/** Increment stock (always succeeds for finite inputs). */
export function incrementStock(
  currentQty: number,
  qty: number,
  sku: string,
  reason: string,
  clock: () => string = utcIsoNow
): IncrementResult {
  if (!Number.isFinite(qty)) {
    throw new RangeError("qty must be finite");
  }
  const balanceAfter = currentQty + qty;
  const entry: MovementEntry = {
    id: uid(),
    sku,
    delta: qty,
    reason,
    balanceAfter,
    at: clock(),
  };
  movementLog.push(entry);
  return { ok: true, qty: balanceAfter, entry };
}

export type CultivarReference = {
  scope: "inventory" | "listing";
  cultivarId: string;
};

/**
 * Whether a cultivar can be deleted — blocked when inventory or listings reference it.
 */
export function canDeleteCultivar(
  cultivarId: string,
  references: CultivarReference[]
): { canDelete: boolean; blockers: string[] } {
  const blockers = references
    .filter((r) => r.cultivarId === cultivarId)
    .map((r) => `${r.scope}:${r.cultivarId}`);
  return { canDelete: blockers.length === 0, blockers };
}
