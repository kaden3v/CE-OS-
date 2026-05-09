import { useCallback, useMemo, useRef, useState } from "react";

export type FieldValidators<T extends Record<string, unknown>> = Partial<{
  [K in keyof T]: (value: T[K], values: T) => string | undefined;
}>;

function shallowEqual(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    if (a[k] !== b[k]) return false;
  }
  return true;
}

export function useForm<T extends Record<string, unknown>>(
  initial: T,
  validators?: FieldValidators<T>
) {
  const baselineRef = useRef<T>({ ...initial });
  const [values, setValuesState] = useState<T>(() => ({ ...initial }));
  const [errors, setErrors] = useState<Partial<Record<keyof T, string>>>({});

  const isDirty = useMemo(
    () => !shallowEqual(values as Record<string, unknown>, baselineRef.current as Record<string, unknown>),
    [values]
  );

  const setField = useCallback(<K extends keyof T>(key: K, value: T[K]) => {
    setValuesState((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      if (prev[key] === undefined) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const setValues = useCallback((patch: Partial<T>) => {
    setValuesState((prev) => ({ ...prev, ...patch }));
  }, []);

  const reset = useCallback((next?: T) => {
    const target = next !== undefined ? { ...next } : { ...baselineRef.current };
    if (next !== undefined) {
      baselineRef.current = { ...next };
    }
    setValuesState(target);
    setErrors({});
  }, []);

  const validate = useCallback((): boolean => {
    const next: Partial<Record<keyof T, string>> = {};
    if (validators) {
      for (const key of Object.keys(validators) as (keyof T)[]) {
        const fn = validators[key];
        if (!fn) continue;
        const msg = fn(values[key], values);
        if (msg) next[key] = msg;
      }
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }, [validators, values]);

  return {
    values,
    errors,
    setField,
    setValues,
    reset,
    validate,
    isDirty,
  };
}
