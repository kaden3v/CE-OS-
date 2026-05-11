/**
 * Client-side persistence for the finance store.
 *
 * localStorage is plenty for a single-user workload (5MB limit ≈ thousands of
 * journal entries even with verbose JSON). Production multi-user wants to
 * move the store to the server backed by Postgres; the data shape is
 * already correct for a 1:1 mapping.
 *
 * Versioned keys (`ce-os.finance.v1.*`) so a future shape change can migrate.
 */

const PREFIX = 'ce-os.finance.v1';

export function load<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(`${PREFIX}.${key}`);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as T;
    return parsed;
  } catch (err) {
    console.warn('[finance.persist] failed to load', key, err);
    return fallback;
  }
}

export function save<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(`${PREFIX}.${key}`, JSON.stringify(value));
  } catch (err) {
    // QuotaExceededError if the user filled localStorage. We don't pop a
    // toast from here (no useApp context); the calling layer surfaces it.
    console.error('[finance.persist] failed to save', key, err);
  }
}

/** For "Reset finance data" in Settings (or tests). */
export function clearAll(): void {
  if (typeof window === 'undefined') return;
  for (const k of Object.keys(window.localStorage)) {
    if (k.startsWith(`${PREFIX}.`)) window.localStorage.removeItem(k);
  }
}
