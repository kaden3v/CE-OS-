import type { Session, User } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { DEMO_SEED, DEMO_PROFILE_SEED } from "./seed";
import { DEMO_USER_ID, DEMO_EMAIL, type DemoProfile } from "./ids";

export { DEMO_USER_ID, DEMO_EMAIL };
export type { DemoProfile };

/**
 * Demo (local-only) backend.
 *
 * CEOS is normally backed by Supabase. When the user clicks "Try the demo" on
 * the sign-in screen we flip into demo mode: a synthetic signed-in admin user
 * whose data lives entirely in localStorage. No network, no signup, no secrets.
 * This makes every page and CRUD path fully exercisable offline.
 *
 * Storage layout (all under the shared `ceos:` namespace so the existing
 * "Reset local data" dev tool clears it too):
 *   ceos:demo                 → "1" when demo mode is active
 *   ceos:demo:profile         → the demo user's profile row (JSON)
 *   ceos:demo:table:<name>    → an array of rows for one table (JSON)
 */

type TableName = keyof Database["public"]["Tables"];

export const DEMO_FLAG_KEY = "ceos:demo";
const PROFILE_KEY = "ceos:demo:profile";
const TABLE_PREFIX = "ceos:demo:table:";

export const demoUser = {
  id: DEMO_USER_ID,
  email: DEMO_EMAIL,
  aud: "authenticated",
  role: "authenticated",
  app_metadata: { provider: "demo" },
  user_metadata: { display_name: "Demo Operator" },
  created_at: "2024-01-01T00:00:00.000Z",
  last_sign_in_at: new Date().toISOString(),
} as unknown as User;

export const demoSession = {
  access_token: "demo-access-token",
  refresh_token: "demo-refresh-token",
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  token_type: "bearer",
  user: demoUser,
} as unknown as Session;

// ---------------------------------------------------------------------------
// Flag
// ---------------------------------------------------------------------------

export function isDemoActive(): boolean {
  try {
    return localStorage.getItem(DEMO_FLAG_KEY) === "1";
  } catch {
    return false;
  }
}

export function setDemoActive(on: boolean): void {
  try {
    if (on) localStorage.setItem(DEMO_FLAG_KEY, "1");
    else localStorage.removeItem(DEMO_FLAG_KEY);
  } catch {
    /* storage unavailable — non-fatal */
  }
}

// ---------------------------------------------------------------------------
// Low-level JSON helpers
// ---------------------------------------------------------------------------

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.error("[demo] write failed", key, err);
  }
}

function tableKey(table: TableName | string): string {
  return `${TABLE_PREFIX}${table}`;
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

export function getDemoProfile(): DemoProfile {
  return readJson<DemoProfile>(PROFILE_KEY, DEMO_PROFILE_SEED);
}

export function updateDemoProfile(patch: Partial<DemoProfile>): DemoProfile {
  const next = { ...getDemoProfile(), ...patch };
  writeJson(PROFILE_KEY, next);
  return next;
}

// ---------------------------------------------------------------------------
// Generic table CRUD
// ---------------------------------------------------------------------------

type Row = Record<string, unknown> & { id: string | number };

function compare(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
}

/** Return all rows for a table, optionally ordered. */
export function demoList<T extends Record<string, unknown>>(
  table: TableName | string,
  opts?: { orderBy?: string; ascending?: boolean },
): T[] {
  const rows = readJson<T[]>(tableKey(table), []);
  const orderBy = opts?.orderBy ?? "updated_at";
  const ascending = opts?.ascending ?? false;
  const sorted = [...rows].sort((a, b) => compare(a[orderBy], b[orderBy]));
  return ascending ? sorted : sorted.reverse();
}

/** Rows matching every key/value in `match`. */
export function demoWhere<T extends Record<string, unknown>>(
  table: TableName | string,
  match: Record<string, unknown>,
): T[] {
  return readJson<T[]>(tableKey(table), []).filter((row) =>
    Object.entries(match).every(([k, v]) => (row as Record<string, unknown>)[k] === v),
  );
}

export function demoInsert<T extends Row>(table: TableName | string, row: T): T {
  const rows = readJson<T[]>(tableKey(table), []);
  writeJson(tableKey(table), [...rows, row]);
  return row;
}

export function demoInsertMany<T extends Row>(table: TableName | string, newRows: T[]): T[] {
  const rows = readJson<T[]>(tableKey(table), []);
  writeJson(tableKey(table), [...rows, ...newRows]);
  return newRows;
}

/** Merge `patch` into the row with this id. Returns the updated row (or null). */
export function demoUpdate<T extends Row>(
  table: TableName | string,
  id: string | number,
  patch: Record<string, unknown>,
): T | null {
  const rows = readJson<T[]>(tableKey(table), []);
  let updated: T | null = null;
  const next = rows.map((row) => {
    if (row.id !== id) return row;
    updated = { ...row, ...patch } as T;
    return updated;
  });
  if (updated) writeJson(tableKey(table), next);
  return updated;
}

/** Delete by id. Returns the number of rows removed. */
export function demoDelete(table: TableName | string, id: string | number): number {
  const rows = readJson<Row[]>(tableKey(table), []);
  const next = rows.filter((row) => row.id !== id);
  writeJson(tableKey(table), next);
  return rows.length - next.length;
}

/** Delete every row matching `match`. Returns the number removed. */
export function demoDeleteWhere(table: TableName | string, match: Record<string, unknown>): number {
  const rows = readJson<Row[]>(tableKey(table), []);
  const next = rows.filter(
    (row) => !Object.entries(match).every(([k, v]) => (row as Record<string, unknown>)[k] === v),
  );
  writeJson(tableKey(table), next);
  return rows.length - next.length;
}

// ---------------------------------------------------------------------------
// Seeding & teardown
// ---------------------------------------------------------------------------

const SEEDED_KEY = "ceos:demo:seeded";

/** Populate localStorage with demo data once (idempotent). */
export function ensureDemoSeeded(): void {
  if (localStorage.getItem(SEEDED_KEY) === "1") return;
  for (const [table, rows] of Object.entries(DEMO_SEED)) {
    // Don't clobber rows the user already created in a prior demo session.
    if (localStorage.getItem(tableKey(table)) == null) {
      writeJson(tableKey(table), rows);
    }
  }
  if (localStorage.getItem(PROFILE_KEY) == null) {
    writeJson(PROFILE_KEY, DEMO_PROFILE_SEED);
  }
  localStorage.setItem(SEEDED_KEY, "1");
}

/** Remove all demo state (flag, profile, seed marker, every table). */
export function clearDemoData(): void {
  try {
    Object.keys(localStorage)
      .filter((k) => k === DEMO_FLAG_KEY || k === SEEDED_KEY || k.startsWith("ceos:demo:"))
      .forEach((k) => localStorage.removeItem(k));
  } catch (err) {
    console.error("[demo] clear failed", err);
  }
}
