/**
 * Tiny file-backed cache for server state we want to survive restarts.
 *
 * One JSON file per key under `data/`. Used today for the bank-feed cache
 * the Plaid webhook writes into. When a real DB lands, this module's API
 * stays put and the implementation swaps to the DB client.
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(process.cwd(), 'data');

function ensureRoot() { if (!existsSync(ROOT)) mkdirSync(ROOT, { recursive: true }); }
function pathFor(key: string) { return join(ROOT, `${key.replace(/[^A-Za-z0-9_-]/g, '_')}.json`); }

export function readCache<T>(key: string, fallback: T): T {
  try {
    const p = pathFor(key);
    if (!existsSync(p)) return fallback;
    return JSON.parse(readFileSync(p, 'utf8')) as T;
  } catch (err) {
    console.warn('[cache] read failed', key, err);
    return fallback;
  }
}

export function writeCache<T>(key: string, value: T): void {
  try {
    ensureRoot();
    writeFileSync(pathFor(key), JSON.stringify(value, null, 2), 'utf8');
  } catch (err) {
    console.error('[cache] write failed', key, err);
  }
}
