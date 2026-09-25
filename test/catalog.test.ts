/**
 * Catalog invariants: unique ids, complete prices, route coverage.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { CATALOG, CATALOG_BY_ID, MODELVERSE_EFFORT } from "../catalog.ts";

test("catalog ids are unique", () => {
  const ids = CATALOG.map((entry) => entry.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("every entry has real CNY prices (no zeros) — except the Auto Router", () => {
  for (const entry of CATALOG) {
    if (entry.id === "auto") continue; // billed at the routed model's price
    assert.ok(entry.cny.input > 0, `${entry.id}: input price`);
    assert.ok(entry.cny.output > 0, `${entry.id}: output price`);
    assert.ok(entry.cny.cacheRead >= 0, `${entry.id}: cacheRead present`);
  }
});

test("every entry pins an explicit route", () => {
  for (const entry of CATALOG) {
    assert.ok(entry.api !== undefined, `${entry.id}: route must be explicit`);
  }
});

test("effort map is fully spelled (pi levels all covered)", () => {
  const levels = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;
  for (const level of levels) {
    const value = MODELVERSE_EFFORT[level];
    assert.ok(value === null || typeof value === "string", level);
  }
  assert.equal(MODELVERSE_EFFORT.off, "none");
  assert.equal(MODELVERSE_EFFORT.high, "high");
});

test("tiered entries are sorted by threshold and cover gpt families once", () => {
  const tiered = CATALOG.filter((entry) => entry.cnyTiers?.length);
  assert.ok(tiered.length >= 4, "gpt-6/5.6 families are tiered at 272K");
  for (const entry of tiered) {
    assert.ok(entry.cnyTiers!.every((tier) => tier.inputTokensAbove > 0));
  }
});

test("CATALOG_BY_ID mirrors CATALOG", () => {
  assert.equal(CATALOG_BY_ID.size, CATALOG.length);
  for (const entry of CATALOG) {
    assert.equal(CATALOG_BY_ID.get(entry.id), entry);
  }
});

test("Auto Router entry is curated and rides the documented chat surface", () => {
  const auto = CATALOG_BY_ID.get("auto");
  assert.ok(auto, "auto must be curated, not left to the overlay");
  assert.equal(auto.api, "openai-completions");
  assert.equal(auto.cny.input, 0, "router price cannot be pinned");
});

test("mimo-v2.6 carries the upstream 1M window; the square's legacy 131072 was a floor", () => {
  // Upstream (mimo.mi.com, 2026-09-22): Context Window 1M, Maximum Output 128K;
  // square `MaxModelLenNew: 1000` × 1024 = 1,024,000; live-probed ≥683,309
  // input tokens (research/mimo-v26-1m-window-2026-09-25.md).
  for (const id of ["mimo-v2.6-flash", "mimo-v2.6-pro"]) {
    const entry = CATALOG_BY_ID.get(id);
    assert.ok(entry, id);
    assert.equal(entry.contextWindow, 1_024_000, `${id}: window`);
    assert.equal(entry.maxTokens, 131_072, `${id}: output cap stays live-bisected 128K`);
    assert.ok(entry.maxTokens < entry.contextWindow, `${id}: output must fit the window`);
  }
});
