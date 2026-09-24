/**
 * Discovery: id filtering against the real 277-id listing shape, price
 * extraction, overlay semantics (unknowns-only, known ids keep curated data).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  buildOverlay,
  extractCnyPrice,
  parseModelIds,
  SKIP_MODEL_IDS,
  type GatewayModelListing,
} from "../discovery.ts";
import { CATALOG_BY_ID } from "../catalog.ts";

/**
 * The captured listing shape (two real keys, 2026-09-24): trimmed to the
 * KEY2 grant set (7 ids) with full pricing blocks kept verbatim, plus a
 * synthetic non-chat spread to exercise the filters.
 */
const FIXTURE_KEY2: { data: unknown[] } = JSON.parse(
  readFileSync(fileURLToPath(import.meta.resolve("./fixtures/key2-listing.json")), "utf8"),
);

test("parseModelIds: the granted set survives, grant-unusable ids are dropped", () => {
  const ids = parseModelIds(FIXTURE_KEY2);
  // KEY2 grants: mimo-flash, mimo-pro, jev, gemini-3.8, gemini-3.7, gpt-5.6-luna, terra.
  // jev is a decisions model — excluded by SKIP_MODEL_IDS.
  assert.deepEqual(new Set(ids), new Set([
    "mimo-v2.6-flash",
    "mimo-v2.6-pro",
    "gemini-3.8-flash",
    "gemini-3.7-flash",
    "gpt-5.6-luna",
    "gpt-5.6-terra",
  ]));
});

test("SKIP_MODEL_IDS: decisions model and 404-dead flagship never register", () => {
  const ids = parseModelIds({
    data: [
      { id: "jev-1.13.0" },
      { id: "MiniMax-H3-Max" },
      { id: "minimax-h3-context-ir" },
      { id: "auto" },
      { id: "claude-opus-5-5" },
    ],
  });
  assert.deepEqual(ids, ["claude-opus-5-5"]);
  assert.ok(SKIP_MODEL_IDS.has("jev-1.13.0"));
});

test("non-chat modalities are filtered: a 277-style listing reduces to chat ids", () => {
  const broad = [
    ...FIXTURE_KEY2.data,
    { id: "suno-v6" },
    { id: "wan2.7-t2v" },
    { id: "kling-v3" },
    { id: "viduq3-turbo" },
    { id: "flux-2-pro" },
    { id: "midjourney-fast-imagine" },
    { id: "grok-imagine-video" },
    { id: "text-embedding-3-small" },
    { id: "BAAI/bge-m3" },
    { id: "qwen3-reranker-8b" },
    { id: "whisper-1" },
    { id: "cicada-tts" },
    { id: "speech-2.8-hd" },
    { id: "qwen-mt-flash" },
    { id: "exa-web-search" },
    { id: "doubao-web-search-global" },
    { id: "easydoc-parse-premium" },
    { id: "gpt-image-2" },
    { id: "qwen-image-3.0" },
    { id: "gpt-realtime-2.1" },
    { id: "gpt-4o-transcribe-diarize" },
    { id: "gemini-3.5-live-translate-preview" },
    { id: "gpt-5.1-batch" },
    { id: "gemini-3.6-flash-batch" },
    { id: "qwen-audio-3.0-realtime-flash" },
    { id: "happyhorse-1.1-t2v" },
    { id: "doubao-seedance-2-0-fast-260128" },
    { id: "doubao-seedream-5-0-pro-260628" },
    { id: "pixverse-v6" },
    { id: "grok-imagine-image" },
  ];
  const ids = parseModelIds({ data: broad });
  const expected = [
    "mimo-v2.6-flash",
    "mimo-v2.6-pro",
    "gemini-3.8-flash",
    "gemini-3.7-flash",
    "gpt-5.6-luna",
    "gpt-5.6-terra",
  ];
  assert.deepEqual(ids, expected);
});

test("chat models from the broad listing are not false-positived by the filters", () => {
  const ids = parseModelIds({
    data: [
      { id: "claude-opus-5-5" },
      { id: "claude-sonnet-5" },
      { id: "gpt-6-luna" },
      { id: "grok-4.7" },
      { id: "kimi-k3" },
      { id: "kimi-k2.7-code-highspeed" },
      { id: "deepseek-v4.1-flash" },
      { id: "deepseek-v4-pro-0813" },
      { id: "glm-5.3" },
      { id: "qwen3.8-max" },
      { id: "MiniMax-M2.7" },
      { id: "MiniMax-H3" },
      { id: "laya" },
      { id: "Qwen/Qwen3-Max" },
      { id: "openai/gpt-5.2" },
      { id: "zai-org/glm-4.7" },
      { id: "publishers/google/models/gemini-3.1-pro-preview" },
    ],
  });
  assert.equal(ids.length, 17, `lost some: ${ids}`);
});

test("extractCnyPrice: single default band converts; tiered/promo/odd shapes do not", () => {
  const flash = FIXTURE_KEY2.data.find(
    (entry): entry is GatewayModelListing => (entry as { id?: string }).id === "mimo-v2.6-flash",
  );
  assert.deepEqual(extractCnyPrice(flash), { input: 1, output: 2, cacheRead: 0.02 });

  // gpt-6-luna is two-band tiered (0,272K] / (272K,UNLIMIT] → no auto price.
  assert.equal(extractCnyPrice({ pricing: [{ Condition: "0,272K", Rates: [] }, { Condition: "272K+", Rates: [] }] }), undefined);
  assert.equal(extractCnyPrice(undefined), undefined);
  assert.equal(extractCnyPrice({ pricing: [] }), undefined);
  assert.equal(extractCnyPrice({ pricing: [{ Rates: [{ ChargeItem: "input", Price: 1 }] }] }), undefined);
  // no cache price → unusable (do not bill a missing tier as 0 by accident).
  assert.equal(
    extractCnyPrice({ pricing: [{ Rates: [
      { ChargeItem: "input", Price: 1 },
      { ChargeItem: "output_text_tokens", Price: 2 },
    ] }] }),
    undefined,
  );
});

test("buildOverlay: known ids are not re-emitted; unknowns get prices from the listing", () => {
  const overlay = buildOverlay(FIXTURE_KEY2.data as GatewayModelListing[], "https://api.modelverse.cn/v1", 6.7252);
  const overlayIds = overlay.map((model) => model.id);
  // Everything in the fixture grant set is already curated → empty overlay.
  assert.deepEqual(overlayIds, []);

  const withNew = [
    ...FIXTURE_KEY2.data,
    {
      id: "mimo-v3.0-pro",
      pricing: [{ Rates: [
        { ChargeItem: "input", Price: 4 },
        { ChargeItem: "output_text_tokens", Price: 8 },
        { ChargeItem: "cache", Price: 0.04 },
      ] }],
    },
  ];
  const overlay2 = buildOverlay(withNew as GatewayModelListing[], "https://api.modelverse.cn/v1", 6.7252);
  assert.deepEqual(overlay2.map((model) => model.id), ["mimo-v3.0-pro"]);
  const [model] = overlay2;
  assert.equal(model.api, "openai-responses"); // mimo family guess
  assert.ok(Math.abs(model.cost.input - 4 / 6.7252) < 1e-6);
  assert.equal(model.reasoning, true);
});

test("parseModelIds tolerates garbage bodies", () => {
  assert.deepEqual(parseModelIds(null), []);
  assert.deepEqual(parseModelIds({}), []);
  assert.deepEqual(parseModelIds({ data: "nope" }), []);
  assert.deepEqual(parseModelIds({ data: [{ id: 42 }, null, { id: " x " }, { id: "" }] }), ["x"]);
});
