import { useState, useEffect, useRef, Dispatch, SetStateAction } from "react";

const STORAGE_PREFIX = "ceos:";

export function usePersistedState<T>(
  key: string,
  initial: T | (() => T),
): [T, Dispatch<SetStateAction<T>>] {
  const storageKey = STORAGE_PREFIX + key;

  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw !== null) return JSON.parse(raw) as T;
    } catch {}
    return typeof initial === "function" ? (initial as () => T)() : initial;
  });

  const isFirst = useRef(true);
  useEffect(() => {
    if (isFirst.current) {
      isFirst.current = false;
      return;
    }
    try {
      localStorage.setItem(storageKey, JSON.stringify(value));
    } catch {}
  }, [storageKey, value]);

  return [value, setValue];
}

export function clearPersistedState(prefix = "") {
  const full = STORAGE_PREFIX + prefix;
  Object.keys(localStorage)
    .filter(k => k.startsWith(full))
    .forEach(k => localStorage.removeItem(k));
}
