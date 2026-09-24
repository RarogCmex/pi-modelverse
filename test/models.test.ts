/**
 * Catalog -> Model conversion: routes, compat flags, currency, baseUrl tricks.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { CATALOG } from "../catalog.ts";
import {
  anthropicBaseUrl,
  buildModels,
  cnyPerUsd,
  cnyToUsd,
  entryToModel,
  guessApi,
  guessInput,
  guessThinking,
  guessWindows,
  unknownIdToModel,
} from "../models.ts";

const BASE = "https://api.modelverse.cn/v1";

test("anthropic route strips /v1 from baseUrl", () => {
  const claude = entryToModel(CATALOG_BY("claude-opus-5-5"), BASE, 6.7252);
  assert.equal(claude.api, "anthropic-messages");
  assert.equal(claude.baseUrl, "https://api.modelverse.cn");
});

test("anthropicBaseUrl handles mirrors and no-slash inputs", () => {
  assert.equal(anthropicBaseUrl("https://api.modelverse.cn/v1/"), "https://api.modelverse.cn");
  assert.equal(anthropicBaseUrl("https://mirror.example.com/v1"), "https://mirror.example.com");
  assert.equal(anthropicBaseUrl("https://api.modelverse.cn"), "https://api.modelverse.cn");
});

test("openai routes keep /v1 baseUrl", () => {
  for (const id of ["gpt-6-luna", "mimo-v2.6-flash", "gemini-3.8-flash", "glm-5.3"]) {
    const model = entryToModel(CATALOG_BY(id), BASE, 6.7252);
    assert.equal(model.baseUrl, BASE, id);
  }
});

test("claude model gets anthropic compat and text-only input", () => {
  const claude = entryToModel(CATALOG_BY("claude-opus-5-5"), BASE, 6.7252);
  assert.equal(claude.reasoning, false);
  assert.deepEqual(claude.input, ["text"]);
});

test("completions models pin max_completion_tokens", () => {
  const gpt56 = entryToModel(CATALOG_BY("gpt-5.6-luna"), BASE, 6.7252);
  assert.equal(gpt56.api, "openai-completions");
  assert.equal((gpt56 as { compat: { maxTokensField?: string } }).compat.maxTokensField, "max_completion_tokens");
});

test("reasoners carry effort maps on responses", () => {
  const mimo = entryToModel(CATALOG_BY("mimo-v2.6-flash"), BASE, 6.7252);
  assert.equal(mimo.api, "openai-responses");
  assert.equal(mimo.reasoning, true);
  assert.equal(mimo.thinkingLevelMap?.off, "none");
  assert.equal(mimo.thinkingLevelMap?.high, "high");
});

test("always-on chat reasoner hides off and sends no effort params", () => {
  const glm = entryToModel(CATALOG_BY("glm-5.3"), BASE, 6.7252);
  assert.equal(glm.api, "openai-completions");
  assert.equal(glm.reasoning, true);
  assert.equal(glm.thinkingLevelMap?.off, null);
  assert.equal((glm as { compat: { supportsReasoningEffort?: boolean } }).compat.supportsReasoningEffort, false);
});

test("CNY conversion is applied at the documented rate and respects the env override", () => {
  const mimo = entryToModel(CATALOG_BY("mimo-v2.6-flash"), BASE, 6.7252);
  assert.ok(Math.abs(mimo.cost.input - 1 / 6.7252) < 1e-6);
  assert.ok(Math.abs(mimo.cost.output - 2 / 6.7252) < 1e-6);

  const custom = cnyPerUsd(() => "10");
  assert.equal(custom, 10);
  const fallback = cnyPerUsd(() => undefined);
  assert.equal(fallback, 6.7252);
  const garbage = cnyPerUsd(() => "not a number");
  assert.equal(garbage, 6.7252);
});

test("tiered entries produce sorted ModelCost.tiers", () => {
  const gpt6 = entryToModel(CATALOG_BY("gpt-6-luna"), BASE, 6.7252);
  assert.equal(gpt6.cost.tiers?.length, 1);
  assert.equal(gpt6.cost.tiers?.[0].inputTokensAbove, 272_000);
  assert.ok((gpt6.cost.tiers?.[0].input ?? 0) > gpt6.cost.input);
});

test("cacheWrite is converted, absent write prices report 0", () => {
  const claude = entryToModel(CATALOG_BY("claude-opus-5-5"), BASE, 6.7252);
  assert.ok(Math.abs(claude.cost.cacheWrite - 36 / 6.7252) < 1e-6);
  const mimo = entryToModel(CATALOG_BY("mimo-v2.6-flash"), BASE, 6.7252);
  assert.equal(mimo.cost.cacheWrite, 0);
});

test("family guesses route the matrices verified live", () => {
  assert.equal(guessApi("claude-sonnet-5"), "anthropic-messages");
  assert.equal(guessApi("claude-opus-4-8"), "anthropic-messages");
  assert.equal(guessApi("gpt-6-sol"), "openai-responses");
  assert.equal(guessApi("openai/gpt-5.2"), "openai-responses");
  assert.equal(guessApi("o3-2025-04-16"), "openai-responses");
  assert.equal(guessApi("gpt-5.3-codex"), "openai-responses");
  assert.equal(guessApi("gpt-5.6-luna"), "openai-completions");
  assert.equal(guessApi("gemini-3.1-pro-preview"), "openai-completions");
  assert.equal(guessApi("glm-5.3-flash"), "openai-completions");
  assert.equal(guessApi("mimo-v2.5"), "openai-responses");
  assert.equal(guessApi("deepseek-v4-pro-0813"), "openai-responses");
  assert.equal(guessApi("kimi-k2.7-code"), "openai-responses");
  assert.equal(guessApi("qwen3.7-max"), "openai-responses");
  assert.equal(guessApi("MiniMax-M2.7"), "openai-completions");
});

test("guessthinking: reasoner families get effort on responses, always on completions", () => {
  assert.equal(guessThinking("mimo-v2.5-pro", "openai-responses").kind, "effort");
  assert.equal(guessThinking("glm-5.3-flash", "openai-completions").kind, "always");
  assert.equal(guessThinking("gemini-3.6-flash", "openai-completions").kind, "none");
  assert.equal(guessThinking("unknown-model", "openai-completions").kind, "none");
});

test("guessInput: claude/mimo/gemini/VL families take images", () => {
  assert.deepEqual(guessInput("claude-sonnet-5"), ["text", "image"]);
  assert.deepEqual(guessInput("mimo-v2.5-pro"), ["text", "image"]);
  assert.deepEqual(guessInput("glm-5.3"), ["text"]);
});

test("unknown without listing price is zero-cost, not invented", () => {
  const model = unknownIdToModel("some-brand-new-id", undefined, BASE, 6.7252);
  assert.deepEqual(model.cost, { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
  assert.equal(model.contextWindow, 32_768);
});

test("unknown with listing price converts it", () => {
  const model = unknownIdToModel(
    "some-brand-new-id",
    { input: 7, output: 21, cacheRead: 0.7 },
    BASE,
    6.7252,
  );
  assert.ok(Math.abs(model.cost.input - 7 / 6.7252) < 1e-6);
});

test("buildModels converts every catalog entry", () => {
  const models = buildModels(BASE);
  assert.equal(models.length, CATALOG.length);
  assert.ok(models.every((model) => model.provider === "modelverse"));
});

function CATALOG_BY(id: string) {
  const entry = CATALOG.find((entry) => entry.id === id);
  if (!entry) throw new Error(`no catalog entry ${id}`);
  return entry;
}
