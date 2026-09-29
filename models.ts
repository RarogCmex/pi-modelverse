/**
 * Catalog -> pi `Model` conversion.
 *
 * Same two non-inferable things as every China gateway for pi:
 *
 *  1. Currency. Modelverse publishes CNY per 1M tokens; pi's `ModelCost` is
 *     USD per 1M. Converted at a documented rate, overridable via
 *     `MODELVERSE_CNY_PER_USD`. The default rate is deliberately the same in
 *     every CNY-priced gateway plugin we ship, so cost reports stay
 *     cross-gateway comparable.
 *
 *  2. Request shape. `api.modelverse.cn` matches none of pi's URL
 *     auto-detection rules, so compat flags are set deliberately per surface.
 *
 * Routing is per-entry and single-surface (probed; see catalog.ts). The
 * anthropic route gets a baseUrl with `/v1` stripped: pi's
 * `anthropicMessagesApi` posts to `{base}/v1/messages`, so the model needs
 * `https://api.modelverse.cn`, not `.../v1`.
 */

import type { AnthropicMessagesCompat, Model, ModelCost, OpenAICompletionsCompat, OpenAIResponsesCompat } from "@earendil-works/pi-ai";
import type { SquareSpec } from "./square.ts";
import {
  CATALOG,
  MODELVERSE_EFFORT,
  type CatalogEntry,
  type CnyPrice,
  type CnyTier,
  type GatewayApi,
  type ThinkingControl,
} from "./catalog.ts";

export type { GatewayApi } from "./catalog.ts";

export const PROVIDER_ID = "modelverse";
export const DEFAULT_BASE_URL = "https://api.modelverse.cn/v1";

/**
 * CNY per 1 USD: the mid-market rate observed 2026-09-15. Deliberately the
 * same default in every CNY-priced gateway plugin we ship, so cost reports
 * stay comparable across them. Overridable via MODELVERSE_CNY_PER_USD.
 */
export const DEFAULT_CNY_PER_USD = 6.7252;

const USD_DECIMALS = 1e6;

export function cnyPerUsd(env: (name: string) => string | undefined = (n) => process.env[n]): number {
  const raw = env("MODELVERSE_CNY_PER_USD");
  const parsed = raw === undefined ? Number.NaN : Number.parseFloat(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_CNY_PER_USD;
}

export function cnyToUsd(cny: number, rate: number): number {
  return Math.round((cny / rate) * USD_DECIMALS) / USD_DECIMALS;
}

function toCost(cny: CnyPrice, tiers: readonly CnyTier[] | undefined, rate: number): ModelCost {
  const cost: ModelCost = {
    input: cnyToUsd(cny.input, rate),
    output: cnyToUsd(cny.output, rate),
    cacheRead: cnyToUsd(cny.cacheRead, rate),
    // Modelverse prices prompt-cache writes for the gpt/claude families;
    // families without a published write price report 0 rather than guessing.
    cacheWrite: cnyToUsd(cny.cacheWrite ?? 0, rate),
  };
  if (tiers?.length) {
    cost.tiers = [...tiers]
      .sort((a, b) => a.inputTokensAbove - b.inputTokensAbove)
      .map((tier) => ({
        inputTokensAbove: tier.inputTokensAbove,
        input: cnyToUsd(tier.input, rate),
        output: cnyToUsd(tier.output, rate),
        cacheRead: cnyToUsd(tier.cacheRead, rate),
        cacheWrite: cnyToUsd(tier.cacheWrite ?? 0, rate),
      }));
  }
  return cost;
}

/**
 * Chat-completions flags for this gateway.
 *
 *  - maxTokensField "max_completion_tokens": the OpenAI-generation spelling. NB
 *    (probed 2026-09-24): the gpt-5.6 family IGNORES the cap entirely (both this
 *    field and legacy max_tokens — cap=8 yielded 163 tokens), so there maxTokens
 *    is advisory for pi's budget math, not enforced upstream. Families that do
 *    enforce it (gemini, mimo) accept this spelling.
 *  - no strict schema / store / grammar tools / long-cache retention:
 *    none are documented on api.modelverse.cn.
 *  - thinking: completions entries are `none` or `always`, so no thinking
 *    parameters are ever sent on this surface (reasoning streams in as
 *    `reasoning_content`, which pi-ai parses natively).
 */
const CHAT_COMPAT: OpenAICompletionsCompat = {
  maxTokensField: "max_completion_tokens",
  supportsDeveloperRole: false,
  supportsStrictMode: false,
  supportsStore: false,
  supportsLongCacheRetention: false,
  supportsOpenAIGrammarTools: false,
  requiresToolResultName: false,
  requiresAssistantAfterToolResult: false,
  requiresThinkingAsText: false,
};

/** Responses flags: deliberately vanilla (verified with plain payloads). */
const RESPONSES_COMPAT: OpenAIResponsesCompat = {
  supportsDeveloperRole: false,
  supportsStrictMode: false,
  supportsLongCacheRetention: false,
  supportsOpenAIGrammarTools: false,
};

/**
 * Anthropic flags. Two deliberate pi defaults kept (cache_control on tools,
 * ttl), plus session affinity: the gateway's prompt-cache guide recommends an
 * `X-Session-ID` header for scheduling affinity (docs 2026-09, probed sources:
 * astraflow.ucloud.cn “提高 Prompt Cache 命中率”). pi's anthropic adapter sends
 * `x-session-id` natively when sessionAffinityFormat is "openrouter" — same
 * header, case-insensitive — and pi already places `cache_control` on content
 * blocks, which is exactly the form this platform supports (top-level
 * `cache_control` is rejected upstream).
 */
const ANTHROPIC_COMPAT: AnthropicMessagesCompat = {
  sendSessionAffinityHeaders: true,
  sessionAffinityFormat: "openrouter",
};

/** {base}/v1 → {base}; anthropic SDK appends its own /v1/messages. */
export function anthropicBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "").replace(/\/v1$/, "");
}

function thinkingLevelMap(thinking: ThinkingControl): Model<GatewayApi>["thinkingLevelMap"] | undefined {
  switch (thinking.kind) {
    case "effort":
      return thinking.levels;
    case "always":
      return { off: null };
    default:
      return undefined;
  }
}

function completionsThinkingCompat(entry: CatalogEntry): {
  reasoning: boolean;
  compat: OpenAICompletionsCompat;
  thinkingLevelMap?: Model<GatewayApi>["thinkingLevelMap"];
} {
  switch (entry.thinking.kind) {
    case "none":
      return { reasoning: false, compat: { supportsReasoningEffort: false } };
    case "always":
      return {
        reasoning: true,
        compat: { supportsReasoningEffort: false },
        thinkingLevelMap: { off: null },
      };
    case "effort":
      return {
        reasoning: true,
        compat: { supportsReasoningEffort: true },
        thinkingLevelMap: entry.thinking.levels,
      };
  }
}

export type ModelverseModel = Model<GatewayApi>;

export function entryToModel(entry: CatalogEntry, baseUrl: string, rate: number): ModelverseModel {
  const api: GatewayApi = entry.api ?? "openai-completions";
  const cost = toCost(entry.cny, entry.cnyTiers, rate);
  const map = thinkingLevelMap(entry.thinking);

  if (api === "anthropic-messages") {
    const model: Model<"anthropic-messages"> = {
      id: entry.id,
      name: entry.name,
      api,
      provider: PROVIDER_ID,
      baseUrl: anthropicBaseUrl(baseUrl),
      reasoning: entry.thinking.kind === "effort",
      input: entry.input,
      cost,
      contextWindow: entry.contextWindow,
      maxTokens: entry.maxTokens,
      compat: { ...ANTHROPIC_COMPAT },
    };
    if (map) model.thinkingLevelMap = map;
    return model;
  }

  if (api === "openai-responses") {
    const model: Model<"openai-responses"> = {
      id: entry.id,
      name: entry.name,
      api,
      provider: PROVIDER_ID,
      baseUrl,
      reasoning: entry.thinking.kind !== "none",
      input: entry.input,
      cost,
      contextWindow: entry.contextWindow,
      maxTokens: entry.maxTokens,
      compat: { ...RESPONSES_COMPAT },
    };
    if (map) model.thinkingLevelMap = map;
    return model;
  }

  const { reasoning, compat, thinkingLevelMap: chatMap } = completionsThinkingCompat(entry);
  const model: Model<"openai-completions"> = {
    id: entry.id,
    name: entry.name,
    api: "openai-completions",
    provider: PROVIDER_ID,
    baseUrl,
    reasoning,
    input: entry.input,
    cost,
    contextWindow: entry.contextWindow,
    maxTokens: entry.maxTokens,
    compat: { ...CHAT_COMPAT, ...compat },
  };
  if (chatMap) model.thinkingLevelMap = chatMap;
  return model;
}

export const UNKNOWN_MODEL_DEFAULTS = {
  contextWindow: 32_768,
  maxTokens: 4_096,
} as const;

/** Bare model name, stripping a vendor segment (`openai/`, `Qwen/`, `zai-org/`). */
export function modelName(id: string): string {
  const slash = id.lastIndexOf("/");
  return slash >= 0 ? id.slice(slash + 1) : id;
}

/**
 * Request surface for an id the catalog has never seen. Family-routed per the
 * live matrix (research/live-probes-2026-09-24.md §1): claude → anthropic;
 * OpenAI-generation (gpt-6, o-series, codex, gpt-5.x) → responses /completions
 * as probed; gemini
 * and glm → completions (their /responses is broken on this gateway);
 * reasoners (mimo, deepseek-v4, qwen3.7+, kimi) → responses.
 */
export function guessApi(id: string): GatewayApi {
  const name = modelName(id).toLowerCase();
  // Auto Router: documented on the Chat Completions surface
  // (api_doc/text_api/auto-router.md) — called with `"model": "auto"`.
  if (name === "auto") return "openai-completions";
  if (/^claude/.test(name)) return "anthropic-messages";
  if (/^gpt-5\.6/.test(name)) return "openai-completions";
  if (/^(gpt-6|gpt-5|gpt-4o|gpt-4\.1|o3-|o4-mini|codex)/.test(name)) return "openai-responses";
  if (/^(mimo|deepseek-v4|kimi-k[23]|qwen3\.[78])/.test(name)) return "openai-responses";
  // gemini /responses: 500 convert_request_failed; glm /responses: empty output.
  if (/^(gemini|glm)/.test(name)) return "openai-completions";
  return "openai-completions";
}

/** Thinking control for an unlisted id. Effort maps only ride the responses
 *  surface where `reasoning.effort` was verified; on completions the same
 *  families degrade to always-on (no parameters sent). */
export function guessThinking(id: string, api: GatewayApi): ThinkingControl {
  const name = modelName(id).toLowerCase();
  const reasoner =
    /^(mimo|deepseek-v4|kimi-k[23]|qwen3\.[78]|glm-5)/.test(name);
  if (!reasoner) return { kind: "none" };
  return api === "openai-responses"
    ? { kind: "effort", levels: MODELVERSE_EFFORT }
    : { kind: "always" };
}

export function guessInput(id: string): ("text" | "image")[] {
  const name = modelName(id).toLowerCase();
  if (/^claude/.test(name)) return ["text", "image"];
  if (/^(mimo|gemini)/.test(name)) return ["text", "image"];
  if (/(vision|-vl\b)/.test(name)) return ["text", "image"];
  return ["text"];
}

export function guessWindows(id: string): { contextWindow: number; maxTokens: number } {
  const name = modelName(id).toLowerCase();
  // Upstream MiMo docs (mimo.mi.com): the whole text family (v2.5→v2.6) is
  // 1M context / 128K output; the square's refreshed MaxModelLenNew agrees
  // (1000 × 1024). Live-probed ≥683,309 on mimo-v2.6-flash (2026-09-25).
  if (/^mimo/.test(name)) return { contextWindow: CTX_1000K, maxTokens: OUT_131K };
  // Family guess for ids the curated table does not know. Deliberately NOT the
  // same numbers as the curated `deepseek-v4.1-flash` entry (131 072 / 131 072):
  // that entry keeps the square's legacy window because nothing verifies the 1M,
  // while an unknown id gets the vendor's advertised pair (square MaxModelLenNew
  // ×1024 = 1M, MaxOutputTokens 384 ×1024 = 393 216). When the square is
  // reachable its per-id spec wins over this guess anyway (see
  // `unknownIdToModel`).
  if (/^deepseek-v4/.test(name)) return { contextWindow: CTX_1M, maxTokens: OUT_393K };
  if (/^glm-5/.test(name)) return { contextWindow: CTX_1M, maxTokens: OUT_131K };
  if (/^(kimi-k3|qwen3\.[78])/.test(name)) return { contextWindow: CTX_262K, maxTokens: CTX_262K };
  if (/^gpt-5\.6|^gpt-6/.test(name)) return { contextWindow: CTX_400K, maxTokens: OUT_32K };
  if (/^gemini-3/.test(name)) return { contextWindow: CTX_1M, maxTokens: OUT_64K };
  if (/^claude/.test(name)) return { contextWindow: CTX_200K, maxTokens: OUT_64K };
  return { contextWindow: UNKNOWN_MODEL_DEFAULTS.contextWindow, maxTokens: UNKNOWN_MODEL_DEFAULTS.maxTokens };
}

const CTX_1M = 1_048_576;
const CTX_1000K = 1_024_000;
const CTX_262K = 262_144;
const CTX_400K = 409_600;
const CTX_200K = 204_800;
const OUT_393K = 393_216;
const OUT_131K = 131_072;
const OUT_64K = 65_536;
const OUT_32K = 32_768;

/** Semi-dynamic registration for a gateway id this catalog has never seen:
 *  family-guessed route/thinking/windows plus real CNY prices whenever the
 *  listing embeds a usable single-band price (see discovery.ts). */
export function unknownIdToModel(
  id: string,
  pricing: CnyPrice | undefined,
  baseUrl: string,
  rate: number,
  spec?: SquareSpec,
): ModelverseModel {
  const api = guessApi(id);
  const guessed = guessWindows(id);
  // The model square's advertised window beats a family guess when present.
  const contextWindow = spec?.contextWindow ?? guessed.contextWindow;
  // Window and cap come from *independent* sources here (a square spec for one, a
  // family guess for the other), so they can disagree — and the square's own data
  // does disagree for the deepseek-v4 family: legacy MaxModelLen 131 072 against
  // MaxOutputTokens 384 × 1024 = 393 216. pi puts `maxTokens` on the wire, so an
  // uncapped value larger than the window means every request from that id is
  // rejected. The curated table clamps this by hand per entry (see the
  // `deepseek-v4.1-flash` comment in catalog.ts); the overlay has to do it once,
  // here, because its entries are invented at runtime.
  const maxTokens = Math.min(spec?.maxTokens ?? guessed.maxTokens, contextWindow);
  const entry: CatalogEntry = {
    id,
    name: modelName(id),
    api,
    contextWindow,
    maxTokens,
    input: guessInput(id),
    thinking: guessThinking(id, api),
    cny: pricing ?? { input: 0, output: 0, cacheRead: 0 },
  };
  const model = entryToModel(entry, baseUrl, rate);
  if (!pricing) {
    // Never invent a price: zero cost reads as $0.00 instead of a guess.
    model.cost = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  }
  return model;
}

export function buildModels(baseUrl: string, rate: number = cnyPerUsd()): ModelverseModel[] {
  return CATALOG.map((entry) => entryToModel(entry, baseUrl, rate));
}
