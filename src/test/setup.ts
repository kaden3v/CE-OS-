import "@testing-library/jest-dom/vitest";

/**
 * Node 25 can expose an incomplete `localStorage` (e.g. missing `clear`).
 * Provide an in-memory implementation so hooks tests behave like browsers.
 */
(() => {
  if (typeof window === "undefined") return;
  const mem = new Map<string, string>();
  const ls = {
    get length() {
      return mem.size;
    },
    clear() {
      mem.clear();
    },
    getItem(key: string) {
      return mem.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      mem.set(key, String(value));
    },
    removeItem(key: string) {
      mem.delete(key);
    },
    key(index: number) {
      return [...mem.keys()][index] ?? null;
    },
  };
  Object.defineProperty(window, "localStorage", {
    value: ls,
    configurable: true,
  });
})();
