/**
 * Model-square spec parsing (the public ListUFSquareModelGuest payload).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSquareCatalog, parseSquareModel } from "../square.ts";

test("MaxModelLen is the context window; MaxOutputTokens is in 1024-token units", () => {
  // Real entry (mimo-v2.6-pro, captured 2026-09-24). 128 * 1024 = 131072
  // matches the live bisection of the output cap exactly.
  const spec = parseSquareModel({
    Name: "mimo-v2.6-pro",
    MaxModelLen: 131072,
    MaxOutputTokens: 128,
    MaxInputTokens: 0,
    ApiProtocols: { ChatCompletions: true, Responses: false, Gemini: false, Anthropic: true },
  });
  assert.equal(spec?.contextWindow, 131072);
  assert.equal(spec?.maxTokens, 131072);
  assert.equal(spec?.maxInputTokens, undefined, "0 means 'not set'");
  assert.deepEqual(spec?.protocols, { chat: true, responses: false, gemini: false, anthropic: true });
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
  assert.equal(parseSquareModel({ Name: "x", MaxModelLen: 0, MaxOutputTokens: 0 }), undefined);
});

test("parseSquareCatalog keys by model name and skips junk", () => {
  const map = parseSquareCatalog({
    SquareModels: [
      { Name: "mimo-v2.6-flash", MaxModelLen: 131072, MaxOutputTokens: 128 },
      { Name: "kimi-k3", MaxModelLen: 131072, MaxOutputTokens: 1000 },
      { Name: "", MaxModelLen: 1 },
      { Name: "no-numbers" },
      null,
    ],
  });
  assert.deepEqual([...map.keys()], ["mimo-v2.6-flash", "kimi-k3"]);
  assert.equal(map.get("kimi-k3")?.maxTokens, 1_024_000);
});

test("non-object payloads yield an empty map", () => {
  assert.equal(parseSquareCatalog(null).size, 0);
  assert.equal(parseSquareCatalog({}).size, 0);
  assert.equal(parseSquareCatalog({ SquareModels: "nope" }).size, 0);
});