/**
 * Model-square spec parsing (the public ListUFSquareModelGuest payload).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSquareCatalog, parseSquareModel } from "../square.ts";

test("MaxModelLenNew (1024-units) wins over the stale legacy MaxModelLen", () => {
  // Real entry (mimo-v2.6-pro, re-captured 2026-09-25): legacy says 131072,
  // the refreshed field says 1000 × 1024 = 1,024,000 — matching upstream's
  // published 1M window (mimo.mi.com) and the live probe (≥683K accepted).
  // 128 * 1024 = 131072 output matches the live bisection exactly.
  const spec = parseSquareModel({
    Name: "mimo-v2.6-pro",
    MaxModelLen: 131072,
    MaxModelLenNew: 1000,
    MaxOutputTokens: 128,
    MaxInputTokens: 0,
    ApiProtocols: { ChatCompletions: true, Responses: false, Gemini: false, Anthropic: true },
  });
  assert.equal(spec?.contextWindow, 1_024_000);
  assert.equal(spec?.maxTokens, 131072);
  assert.equal(spec?.maxInputTokens, undefined, "0 means 'not set'");
  assert.deepEqual(spec?.protocols, { chat: true, responses: false, gemini: false, anthropic: true });
});

test("legacy MaxModelLen still applies when MaxModelLenNew is unset (0/null)", () => {
  // 0 = not refreshed (67 of 124 entries on 2026-09-25).
  assert.equal(parseSquareModel({ Name: "x", MaxModelLen: 1048576, MaxModelLenNew: 0 })?.contextWindow, 1048576);
  assert.equal(parseSquareModel({ Name: "x", MaxModelLen: 262144, MaxModelLenNew: null })?.contextWindow, 262144);
  assert.equal(parseSquareModel({ Name: "x", MaxModelLen: 204800 })?.contextWindow, 204800);
});

test("when both fields are present and agree, either reading works", () => {
  // Real shape: glm-5.1 has MaxModelLen 204800 and MaxModelLenNew 200 (× 1024).
  const spec = parseSquareModel({ Name: "glm-5.1", MaxModelLen: 204800, MaxModelLenNew: 200 });
  assert.equal(spec?.contextWindow, 204800);
});

test("deepseek-v4.1-flash: 384 output units -> 393216, matching the curated family size", () => {
  const spec = parseSquareModel({ Name: "deepseek-v4.1-flash", MaxModelLen: 131072, MaxOutputTokens: 384 });
  assert.equal(spec?.maxTokens, 393_216);
});

test("a published MaxInputTokens is kept when non-zero", () => {
  const spec = parseSquareModel({ Name: "qwen3.8-max", MaxModelLen: 131072, MaxOutputTokens: 131, MaxInputTokens: 991 });
  assert.equal(spec?.maxInputTokens, 991);
});

test("entries without usable numbers are dropped", () => {
  assert.equal(parseSquareModel(undefined), undefined);
  assert.equal(parseSquareModel({ Name: "x" }), undefined);
  assert.equal(parseSquareModel({ Name: "x", MaxModelLen: 0, MaxModelLenNew: 0, MaxOutputTokens: 0 }), undefined);
});

test("parseSquareCatalog keys by model name and skips junk", () => {
  const map = parseSquareCatalog({
    SquareModels: [
      { Name: "mimo-v2.6-flash", MaxModelLen: 131072, MaxModelLenNew: 1000, MaxOutputTokens: 128 },
      { Name: "kimi-k3", MaxModelLen: 131072, MaxOutputTokens: 1000 },
      { Name: "", MaxModelLen: 1 },
      { Name: "no-numbers" },
      null,
    ],
  });
  assert.deepEqual([...map.keys()], ["mimo-v2.6-flash", "kimi-k3"]);
  assert.equal(map.get("mimo-v2.6-flash")?.contextWindow, 1_024_000);
  assert.equal(map.get("kimi-k3")?.maxTokens, 1_024_000);
});

test("non-object payloads yield an empty map", () => {
  assert.equal(parseSquareCatalog(null).size, 0);
  assert.equal(parseSquareCatalog({}).size, 0);
  assert.equal(parseSquareCatalog({ SquareModels: "nope" }).size, 0);
});
