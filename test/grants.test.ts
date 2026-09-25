/**
 * Grant cache: fingerprinting, memory/file stores, membership filtering.
 *
 * This is the data layer behind the provider's `filterModels` hook: pi calls
 * the filter synchronously while rendering the model picker, so the grant set
 * must be available in memory (and on disk across restarts) before any
 * network call can complete.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createFileGrantStore,
  createMemoryGrantStore,
  filterModelsByGrants,
  keyFingerprint,
  MAX_CACHED_KEYS,
} from "../grants.ts";

const tmpDirs: string[] = [];

function tmpFile(name = "modelverse-grants.json"): string {
  const dir = mkdtempSync(join(tmpdir(), "mv-grants-"));
  tmpDirs.push(dir);
  return join(dir, name);
}

process.on("exit", () => {
  for (const dir of tmpDirs) rmSync(dir, { recursive: true, force: true });
});

test("keyFingerprint: stable, key-distinguishing, and not the key itself", () => {
  const a = keyFingerprint("syntheticmvkeyonesynthet");
  assert.equal(a, keyFingerprint("syntheticmvkeyonesynthet"));
  assert.notEqual(a, keyFingerprint("syntheticmvkeytwosynthet"));
  assert.match(a, /^[0-9a-f]{32}$/);
  assert.ok(!a.includes("syntheti"));
});

test("memory store: records are looked up by key and copied on write", () => {
  const store = createMemoryGrantStore();
  assert.equal(store.lookup("k"), undefined);

  const ids = ["a", "b"];
  store.record("k", ids);
  ids.push("c"); // caller mutating its array must not leak into the store
  assert.deepEqual(store.lookup("k")?.ids, ["a", "b"]);
  assert.equal(store.lookup("other"), undefined);
});

test("filterModelsByGrants: pass-through without information, membership with it", () => {
  const store = createMemoryGrantStore();
  const models = [{ id: "a" }, { id: "b" }, { id: "c", extra: true }];

  // No key at all (provider unconfigured) → nothing to filter by.
  assert.equal(filterModelsByGrants(models, undefined, store), models);
  // Key never observed (fresh install / cached cleared / every refresh failed).
  assert.equal(filterModelsByGrants(models, "unknown", store), models);

  store.record("k", ["b", "c"]);
  assert.deepEqual(filterModelsByGrants(models, "k", store).map((m) => m.id), ["b", "c"]);

  // A key the gateway grants nothing is a real observation: hide everything.
  store.record("empty", []);
  assert.deepEqual(filterModelsByGrants(models, "empty", store), []);
});

test("file store: persists across instances without writing the raw key", () => {
  const file = tmpFile();
  const first = createFileGrantStore(file);
  assert.equal(first.lookup("secret-key-1"), undefined, "missing file → empty cache");
  first.record("secret-key-1", ["mimo-v2.6-flash", "gpt-5.6-luna"]);

  const onDisk = readFileSync(file, "utf8");
  assert.ok(!onDisk.includes("secret-key-1"), "raw key must never hit the disk");
  assert.ok(onDisk.includes(keyFingerprint("secret-key-1")));

  // A second instance (i.e. the next pi start) reads it back synchronously.
  const second = createFileGrantStore(file);
  assert.deepEqual(second.lookup("secret-key-1")?.ids, ["mimo-v2.6-flash", "gpt-5.6-luna"]);
  assert.equal(second.lookup("secret-key-2"), undefined);
});

test("file store: corrupt or unreadable cache degrades to empty, never throws", () => {
  const file = tmpFile();
  writeFileSync(file, "{ not json");
  const store = createFileGrantStore(file);
  assert.equal(store.lookup("k"), undefined);
  store.record("k", ["a"]); // still usable, and repairs the file
  assert.deepEqual(createFileGrantStore(file).lookup("k")?.ids, ["a"]);

  // Entries with a wrong shape are dropped individually, valid ones survive.
  const mixed = tmpFile();
  writeFileSync(
    mixed,
    JSON.stringify({
      version: 1,
      keys: {
        [keyFingerprint("good")]: { ids: ["a", 42, "b"], at: 1 },
        [keyFingerprint("bad-ids")]: { ids: "nope" },
        [keyFingerprint("bad-record")]: "nope",
      },
    }),
  );
  const parsed = createFileGrantStore(mixed);
  assert.deepEqual(parsed.lookup("good")?.ids, ["a", "b"]);
  assert.equal(parsed.lookup("bad-ids"), undefined);
  assert.equal(parsed.lookup("bad-record"), undefined);
});

test("file store: an unchanged re-record does not rewrite the file", () => {
  const file = tmpFile();
  const store = createFileGrantStore(file);
  store.record("k", ["a", "b"]);
  const before = readFileSync(file, "utf8");

  store.record("k", ["a", "b"]); // same set (every startup refresh looks like this)
  assert.equal(readFileSync(file, "utf8"), before, "unchanged grants must not churn the file");

  store.record("k", ["a", "b", "c"]); // changed set is persisted
  assert.notEqual(readFileSync(file, "utf8"), before);
  assert.deepEqual(createFileGrantStore(file).lookup("k")?.ids, ["a", "b", "c"]);
});

test("file store: evicts the stalest keys past the cap, keeping the newest", () => {
  const file = tmpFile();
  const store = createFileGrantStore(file);
  for (let i = 0; i < MAX_CACHED_KEYS + 2; i++) store.record(`key-${i}`, [`id-${i}`]);

  assert.equal(store.lookup("key-0"), undefined, "oldest evicted");
  assert.equal(store.lookup("key-1"), undefined, "second-oldest evicted");
  assert.deepEqual(store.lookup(`key-${MAX_CACHED_KEYS + 1}`)?.ids, [`id-${MAX_CACHED_KEYS + 1}`]);

  const persisted = JSON.parse(readFileSync(file, "utf8")) as { keys: Record<string, unknown> };
  assert.equal(Object.keys(persisted.keys).length, MAX_CACHED_KEYS);

  // Re-recording an existing key promotes it to the newest slot, so it
  // outlives its equally-old peers under pressure.
  const s2 = createFileGrantStore(file);
  s2.record("key-2", ["refreshed"]);
  for (let i = 0; i < MAX_CACHED_KEYS - 1; i++) s2.record(`new-${i}`, []);
  assert.deepEqual(s2.lookup("key-2")?.ids, ["refreshed"], "promoted key survives");
  assert.equal(s2.lookup("key-3"), undefined, "its equally-old peer does not");
});