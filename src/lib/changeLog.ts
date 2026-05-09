import { z } from "zod";
import * as storage from "@/lib/storage";
import {
  CHANGELOG_MAX_BYTES,
  CHANGELOG_MAX_ENTRIES,
} from "@/lib/constants";
import { utcIsoNow } from "@/lib/dates";
import {
  ChangeLogSchema,
  type ChangeLog,
} from "@/lib/schemas";

/** Storage key for {@link ChangeLog} rows — never pass through `useEntity` to avoid recursion. */
export const CHANGELOG_RESOURCE_KEY = "changelog";

const CHANGELOG_ENVELOPE_VERSION = 1;

export type ChangeLogSource = ChangeLog["source"];

function notifyChangeLogSubscribers(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("ce-os:changelog"));
}

function shallowFieldDiff(
  oldRow: Record<string, unknown>,
  newRow: Record<string, unknown>
): Record<string, [unknown, unknown]> {
  const keys = new Set([
    ...Object.keys(oldRow),
    ...Object.keys(newRow),
  ]);
  const diff: Record<string, [unknown, unknown]> = {};
  for (const k of keys) {
    const a = oldRow[k];
    const b = newRow[k];
    const same =
      a === b ||
      (typeof a === "object" &&
        typeof b === "object" &&
        JSON.stringify(a) === JSON.stringify(b));
    if (!same) {
      diff[k] = [a, b];
    }
  }
  return diff;
}

export function capDiffRecord(
  diff: Record<string, [unknown, unknown]>
): Record<string, [unknown, unknown]> {
  try {
    const json = JSON.stringify(diff);
    if (json.length <= CHANGELOG_MAX_BYTES) return diff;
  } catch {
    return {
      __summary: [null, "large change (serialization failed)"] as [unknown, unknown],
    };
  }
  const n = Object.keys(diff).length;
  return {
    __summary: [
      null,
      `large change, ${n} fields modified`,
    ] as [unknown, unknown],
  };
}

function pushEntry(entry: ChangeLog): void {
  const prev = loadChangeLogs();
  const next = [...prev, entry].slice(-CHANGELOG_MAX_ENTRIES);
  storage.set(CHANGELOG_RESOURCE_KEY, {
    version: CHANGELOG_ENVELOPE_VERSION,
    items: next,
  });
  notifyChangeLogSubscribers();
}

function appendValidated(entry: ChangeLog): void {
  const validated = ChangeLogSchema.parse(entry);
  pushEntry(validated);
}

function shouldRecord(resource: string): boolean {
  return resource !== CHANGELOG_RESOURCE_KEY;
}

/** Expand tuple-based diff into two plain records for side-by-side UI. */
export function diffTuplesToSideRecords(diff: ChangeLog["diff"]): {
  before: Record<string, unknown>;
  after: Record<string, unknown>;
} {
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  for (const [k, pair] of Object.entries(diff)) {
    const [a, b] = pair;
    before[k] = a;
    after[k] = b;
  }
  return { before, after };
}

export function loadChangeLogs(): ChangeLog[] {
  const raw = storage.get<{ version?: number; items?: unknown } | null>(
    CHANGELOG_RESOURCE_KEY
  );
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.items)) {
    return [];
  }
  const parsed = z.array(ChangeLogSchema).safeParse(raw.items);
  return parsed.success ? parsed.data : [];
}

export function recordEntityCreate(
  resource: string,
  row: Record<string, unknown>,
  source: ChangeLogSource = "ui"
): void {
  if (!shouldRecord(resource)) return;
  const idVal = row.id;
  const resourceId =
    typeof idVal === "string" || typeof idVal === "number"
      ? String(idVal)
      : "unknown";
  const diff = capDiffRecord({
    __created: [null, row] as [unknown, unknown],
  });
  appendValidated({
    id: crypto.randomUUID(),
    resource,
    resourceId,
    action: "create",
    diff,
    timestamp: utcIsoNow(),
    source,
  });
}

export function recordEntityUpdate(
  resource: string,
  oldRow: Record<string, unknown>,
  newRow: Record<string, unknown>,
  source: ChangeLogSource = "ui"
): void {
  if (!shouldRecord(resource)) return;
  const idVal = newRow.id ?? oldRow.id;
  const resourceId =
    typeof idVal === "string" || typeof idVal === "number"
      ? String(idVal)
      : "unknown";
  const rawDiff = shallowFieldDiff(oldRow, newRow);
  if (Object.keys(rawDiff).length === 0) return;
  const diff = capDiffRecord(rawDiff);
  appendValidated({
    id: crypto.randomUUID(),
    resource,
    resourceId,
    action: "update",
    diff,
    timestamp: utcIsoNow(),
    source,
  });
}

export function recordEntityDelete(
  resource: string,
  deletedRow: Record<string, unknown>,
  source: ChangeLogSource = "ui"
): void {
  if (!shouldRecord(resource)) return;
  const idVal = deletedRow.id;
  const resourceId =
    typeof idVal === "string" || typeof idVal === "number"
      ? String(idVal)
      : "unknown";
  const diff = capDiffRecord({
    __deleted: [deletedRow, null] as [unknown, unknown],
  });
  appendValidated({
    id: crypto.randomUUID(),
    resource,
    resourceId,
    action: "delete",
    diff,
    timestamp: utcIsoNow(),
    source,
  });
}
