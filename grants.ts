/**
 * Per-key grant cache — the data layer behind `filterModels`.
 *
 * The gateway answers `GET /v1/models` with a per-credential view (277+ ids
 * for a broad key, 7 for a promo key), but pi's model picker consults
 * `filterModels` synchronously — there is no room for a network call there.
 * So the grant set observed by the async paths (the discovery refresh, the
 * `/login` probe) is recorded here, keyed by a SHA-256 fingerprint of the API
 * key (the raw key never touches disk), and the filter replays it:
 *
 *   - record seen  → picker shows only models this key actually grants;
 *   - no record    → optimistic pass-through. A key we have never observed
 *                    (fresh install, cleared cache, network down at every
 *                    refresh) must not have its catalog hidden — same failure
 *                    philosophy as the discovery overlay.
 *
 * Persistence: `createFileGrantStore` loads its JSON synchronously at
 * construction (extension load time), so filtering is correct from the very
 * first picker render after a pi restart — before any refresh has run. The
 * file lives beside pi's own state (`getAgentDir()`), written atomically
 * (tmp + rename, mode 0600) because several pi instances may share it.
 * Same pattern as the sibling pi-alibaba-models catalog cache.
 */

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export interface GrantsRecord {
  /** Raw ids from `GET /v1/models` for this key, BEFORE any chat filtering —
   *  membership here is exactly "the gateway says this key may use this id". */
  ids: string[];
  /** Unix ms when the listing was observed. Used for eviction and debugging. */
  at: number;
}

export interface GrantStore {
  /** Grants recorded for this exact key, or undefined when never observed. */
  lookup(apiKey: string): GrantsRecord | undefined;
  /** Remember a listing observation. Never throws (persistence is best-effort). */
  record(apiKey: string, ids: readonly string[]): void;
}

/** Stable non-reversible id for a key. 32 hex chars = 128 bits of SHA-256. */
export function keyFingerprint(apiKey: string): string {
  return createHash("sha256").update(apiKey).digest("hex").slice(0, 32);
}

/** Ephemeral store: process-lifetime only. Tests, live/check.ts, fallback. */
export function createMemoryGrantStore(): GrantStore {
  const byFingerprint = new Map<string, GrantsRecord>();
  return {
    lookup: (apiKey) => byFingerprint.get(keyFingerprint(apiKey)),
    record: (apiKey, ids) => {
      byFingerprint.set(keyFingerprint(apiKey), { ids: [...ids], at: Date.now() });
    },
  };
}

/** How many distinct keys the file keeps before evicting the stalest. */
export const MAX_CACHED_KEYS = 8;

interface FileRecord {
  ids?: unknown;
  at?: unknown;
}

/** Validate the on-disk shape; garbage entries are dropped, not fatal. */
function parseRecords(raw: string): Map<string, GrantsRecord> {
  const out = new Map<string, GrantsRecord>();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return out;
  }
  const keys = (parsed as { keys?: unknown })?.keys;
  if (typeof keys !== "object" || keys === null) return out;
  for (const [fingerprint, value] of Object.entries(keys as Record<string, FileRecord>)) {
    if (typeof value !== "object" || value === null) continue;
    if (!Array.isArray(value.ids)) continue;
    const ids = value.ids.filter((id): id is string => typeof id === "string");
    const at = typeof value.at === "number" ? value.at : 0;
    out.set(fingerprint, { ids, at });
  }
  return out;
}

/**
 * Disk-backed store. Loaded synchronously at construction; every `record`
 * re-persists atomically. All file I/O is best-effort: an unwritable or
 * corrupt cache degrades to memory-only behavior, never to a thrown error
 * (extension load and the refresh path must not fail because of it).
 */
export function createFileGrantStore(filePath: string): GrantStore {
  let byFingerprint = new Map<string, GrantsRecord>();
  try {
    byFingerprint = parseRecords(readFileSync(filePath, "utf8"));
  } catch {
    // Missing file (first run) or unreadable → start empty.
  }

  const persist = (): void => {
    try {
      mkdirSync(dirname(filePath), { recursive: true });
      const payload = JSON.stringify(
        { version: 1, keys: Object.fromEntries(byFingerprint) },
        null,
        2,
      );
      // Atomic replace: concurrent pi instances share this file, and a torn
      // JSON would reset everyone's cache. Private tmp file, then rename.
      const tmp = `${filePath}.${process.pid}.tmp`;
      writeFileSync(tmp, payload, { mode: 0o600 });
      renameSync(tmp, filePath);
    } catch {
      // Best-effort: the in-memory map stays authoritative for this process.
    }
  };

  return {
    lookup: (apiKey) => byFingerprint.get(keyFingerprint(apiKey)),
    record: (apiKey, ids) => {
      const fingerprint = keyFingerprint(apiKey);
      // Startup refreshes re-record an unchanged listing on every run; skip the
      // write (and its mtime churn across concurrent pi instances) when the
      // grant set is identical, but still refresh `at` when it differs.
      const previous = byFingerprint.get(fingerprint);
      const unchanged =
        previous !== undefined &&
        previous.ids.length === ids.length &&
        previous.ids.every((id, index) => id === ids[index]);
      if (unchanged) return;
      // Delete-then-set so a re-recorded key moves to the end of the Map's
      // insertion order — eviction must not depend on `at` (Date.now() ties
      // when several keys are recorded in the same millisecond).
      byFingerprint.delete(fingerprint);
      byFingerprint.set(fingerprint, { ids: [...ids], at: Date.now() });
      while (byFingerprint.size > MAX_CACHED_KEYS) {
        const oldest = byFingerprint.keys().next().value;
        if (oldest === undefined) break;
        byFingerprint.delete(oldest);
      }
      persist();
    },
  };
}

/**
 * The membership filter itself. Deliberately generic over `{ id: string }`
 * so it composes with pi's `Model` lists without importing the model type.
 *
 * Pass-through cases (never hide models on missing information):
 *   - no effective key (unconfigured provider — pi hides it anyway);
 *   - no record for this key (never observed: fresh install, cleared cache,
 *     every refresh so far failed).
 */
export function filterModelsByGrants<T extends { id: string }>(
  models: readonly T[],
  apiKey: string | undefined,
  store: GrantStore,
): readonly T[] {
  if (!apiKey) return models;
  const record = store.lookup(apiKey);
  if (!record) return models;
  const granted = new Set(record.ids);
  return models.filter((model) => granted.has(model.id));
}
