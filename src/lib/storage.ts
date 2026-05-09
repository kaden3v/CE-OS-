const PREFIX = "ce-os:";

function prefixedKey(key: string): string {
  return `${PREFIX}${key}`;
}

export function get<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(prefixedKey(key));
    if (raw === null) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** Exact serialized payload for a storage key (backup / diagnostics). */
export function getRawItem(key: string): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(prefixedKey(key));
}

export function set<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(prefixedKey(key), JSON.stringify(value));
  } catch {
    // Quota or private mode — ignore
  }
}

/** Store an arbitrary string under a prefixed key (e.g. backup blobs). */
export function setRawItem(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(prefixedKey(key), value);
  } catch {
    // ignore
  }
}

export function remove(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(prefixedKey(key));
  } catch {
    // ignore
  }
}

/**
 * Fires when the prefixed key changes in another document (storage event).
 * Same-tab writes do not emit this event.
 */
export function subscribe(key: string, callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const storageKey = prefixedKey(key);
  const handler = (e: StorageEvent) => {
    if (e.key === storageKey) {
      callback();
    }
  };
  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
}
