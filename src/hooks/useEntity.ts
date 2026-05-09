import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import type { ZodType } from "zod";
import * as storage from "@/lib/storage";
import { getRawItem, setRawItem } from "@/lib/storage";
import { ENTITY_STORAGE_VERSION, migrate } from "@/lib/migrations";
import { useApp } from "@/contexts/AppContext";
import {
  recordEntityCreate,
  recordEntityDelete,
  recordEntityUpdate,
} from "@/lib/changeLog";
import { utcIsoNow } from "@/lib/dates";

export type UseEntityOptions = {
  /** Singular label for cross-tab conflict copy (e.g. "Order"). */
  entityLabel?: string;
};

export type StorageConflictState<T> = {
  mine: T;
  theirs: T;
  patch: Partial<Omit<T, "id">>;
  commit?: (next: T) => Promise<void>;
};

function rowHasUpdatedAt(row: unknown): row is { updatedAt: string } {
  return (
    typeof row === "object" &&
    row !== null &&
    "updatedAt" in row &&
    typeof (row as { updatedAt: unknown }).updatedAt === "string"
  );
}

/** Resources that track `updatedAt` for optimistic sync — extend when adding entities. */
function touchUpdatedAtForResource<T extends { id: string | number }>(
  resource: string,
  row: T
): T {
  if (resource !== "orders") return row;
  return { ...row, updatedAt: utcIsoNow() };
}

function defaultEntityLabel(resource: string): string {
  if (resource === "orders") return "Order";
  const strip = resource.replace(/s$/i, "");
  return strip.charAt(0).toUpperCase() + strip.slice(1);
}

function cloneItems<T>(items: T[]): T[] {
  return JSON.parse(JSON.stringify(items)) as T[];
}

export function useEntity<T extends { id: string | number }>(
  resource: string,
  schema: ZodType<T>,
  seed: T[],
  options?: UseEntityOptions
): {
  items: T[];
  add: (item: Omit<T, "id">) => T;
  update: (
    id: T["id"],
    patch: Partial<Omit<T, "id">>,
    opts?: { commit?: (next: T) => Promise<void> }
  ) => void;
  remove: (id: T["id"]) => void;
  reset: () => void;
  /** Present when this tab's in-memory row disagrees with storage before a write. */
  storageConflict: StorageConflictState<T> | null;
  resolveStorageConflict: (action: "discard" | "overwrite") => void;
  conflictEntityLabel: string;
} {
  const { addToast, registerStorageRecoveryIssue } = useApp();
  const seedRef = useRef(seed);
  seedRef.current = seed;

  const entityLabel = options?.entityLabel ?? defaultEntityLabel(resource);

  const [items, setItems] = useState<T[]>(() => [...seed]);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const [storageConflict, setStorageConflict] = useState<StorageConflictState<T> | null>(
    null
  );
  const storageConflictRef = useRef<StorageConflictState<T> | null>(null);

  const setConflict = useCallback((next: StorageConflictState<T> | null) => {
    storageConflictRef.current = next;
    setStorageConflict(next);
  }, []);

  const loadItems = useCallback((): T[] => {
    const rawStr = getRawItem(resource);
    if (rawStr === null) {
      return [...seedRef.current];
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawStr) as unknown;
    } catch {
      const backupKey = `backup:${resource}:${Date.now()}`;
      setRawItem(backupKey, rawStr);
      registerStorageRecoveryIssue(resource, backupKey);
      if (import.meta.env.DEV) {
        console.warn(
          `[CE-OS] Invalid JSON for storage key "${resource}"; using seed. Backup: ${backupKey}`
        );
      }
      return [...seedRef.current];
    }

    const migratedUnknown = migrate(resource, parsed, ENTITY_STORAGE_VERSION);
    const validated = z.array(schema).safeParse(migratedUnknown);
    if (!validated.success) {
      const backupKey = `backup:${resource}:${Date.now()}`;
      setRawItem(backupKey, rawStr);
      registerStorageRecoveryIssue(resource, backupKey);
      if (import.meta.env.DEV) {
        console.warn(
          `[CE-OS] Schema validation failed for "${resource}"; using seed.`,
          validated.error.flatten()
        );
      }
      return [...seedRef.current];
    }

    return validated.data;
  }, [resource, schema, registerStorageRecoveryIssue]);

  const persist = useCallback(
    (nextItems: T[]) => {
      try {
        const validated = z.array(schema).parse(nextItems);
        storage.set(resource, {
          version: ENTITY_STORAGE_VERSION,
          items: validated,
        });
      } catch (e) {
        addToast({
          title: "Could not save",
          description: `Validation failed for ${resource}. Data was not written.`,
          status: "alert",
        });
        throw e;
      }
    },
    [resource, schema, addToast]
  );

  useEffect(() => {
    setItems(loadItems());
    return storage.subscribe(resource, () => {
      setItems(loadItems());
    });
  }, [resource, loadItems]);

  const resolveStorageConflict = useCallback(
    (action: "discard" | "overwrite") => {
      const pending = storageConflictRef.current;
      if (!pending) return;
      setConflict(null);

      if (action === "discard") {
        setItems(loadItems());
        return;
      }

      const snapshot = cloneItems(itemsRef.current);
      const merged = touchUpdatedAtForResource(resource, {
        ...pending.theirs,
        ...pending.patch,
      } as T);
      const nextItems = itemsRef.current.map((x) =>
        x.id === merged.id ? merged : x
      );
      try {
        persist(nextItems);
      } catch {
        return;
      }
      setItems(nextItems);

      const theirsRec = pending.theirs as unknown as Record<string, unknown>;
      const mergedRec = merged as unknown as Record<string, unknown>;

      const { commit } = pending;
      if (commit) {
        void commit(merged)
          .then(() => {
            recordEntityUpdate(resource, theirsRec, mergedRec);
          })
          .catch((err: unknown) => {
            try {
              persist(snapshot);
            } catch {
              /* persist already toasts */
            }
            setItems(snapshot);
            addToast({
              title: "Could not sync",
              description: err instanceof Error ? err.message : String(err),
              status: "alert",
            });
          });
      } else {
        recordEntityUpdate(resource, theirsRec, mergedRec);
      }
    },
    [addToast, loadItems, persist, resource, setConflict]
  );

  const add = useCallback(
    (item: Omit<T, "id">) => {
      const created = touchUpdatedAtForResource(resource, {
        ...item,
        id: crypto.randomUUID() as T["id"],
      } as T);
      setItems((prev) => {
        const next = [created, ...prev];
        try {
          persist(next);
          recordEntityCreate(
            resource,
            created as unknown as Record<string, unknown>
          );
          return next;
        } catch {
          return prev;
        }
      });
      return created;
    },
    [persist, resource]
  );

  const update = useCallback(
    (
      id: T["id"],
      patch: Partial<Omit<T, "id">>,
      opts?: { commit?: (next: T) => Promise<void> }
    ) => {
      const commit = opts?.commit;
      const prev = itemsRef.current;
      const idx = prev.findIndex((x) => x.id === id);
      if (idx === -1) return;

      const memoryRow = prev[idx];
      const storedItems = loadItems();
      const storedRow = storedItems.find((x) => x.id === id);

      if (
        storedRow &&
        rowHasUpdatedAt(memoryRow) &&
        rowHasUpdatedAt(storedRow) &&
        memoryRow.updatedAt !== storedRow.updatedAt
      ) {
        setConflict({
          mine: memoryRow,
          theirs: storedRow,
          patch,
          commit,
        });
        return;
      }

      const snapshot = cloneItems(prev);
      const nextRow = touchUpdatedAtForResource(resource, {
        ...memoryRow,
        ...patch,
      } as T);
      const nextItems = prev.map((x) => (x.id === id ? nextRow : x));

      try {
        persist(nextItems);
      } catch {
        return;
      }
      setItems(nextItems);

      const oldRec = memoryRow as unknown as Record<string, unknown>;
      const newRec = nextRow as unknown as Record<string, unknown>;

      if (commit) {
        void commit(nextRow)
          .then(() => {
            recordEntityUpdate(resource, oldRec, newRec);
          })
          .catch((err: unknown) => {
            try {
              persist(snapshot);
            } catch {
              /* persist already toasts */
            }
            setItems(snapshot);
            addToast({
              title: "Could not sync",
              description: err instanceof Error ? err.message : String(err),
              status: "alert",
            });
          });
      } else {
        recordEntityUpdate(resource, oldRec, newRec);
      }
    },
    [addToast, loadItems, persist, resource, setConflict]
  );

  const remove = useCallback(
    (id: T["id"]) => {
      setItems((prev) => {
        const victim = prev.find((x) => x.id === id);
        const next = prev.filter((x) => x.id !== id);
        try {
          persist(next);
          if (victim) {
            recordEntityDelete(
              resource,
              victim as unknown as Record<string, unknown>
            );
          }
          return next;
        } catch {
          return prev;
        }
      });
    },
    [persist, resource]
  );

  const reset = useCallback(() => {
    const next = [...seedRef.current];
    try {
      persist(next);
      setItems(next);
    } catch {
      /* toast already shown by persist */
    }
  }, [persist]);

  return {
    items,
    add,
    update,
    remove,
    reset,
    storageConflict,
    resolveStorageConflict,
    conflictEntityLabel: entityLabel,
  };
}
