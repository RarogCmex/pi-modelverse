/**
 * Curated Modelverse catalog for https://api.modelverse.cn/v1.
 *
 * Data provenance — every field traces to a live probe on 2026-09-24 unless
 * marked "estimate":
 *
 *   ids + `cny` prices   `GET /v1/models` with auth (KEY1: broad grants,
 *                        KEY2: 7 granted ids) — the listing embeds a `pricing`
 *                        array per model (CNY per 1M tokens, ChargeItems:
 *                        input / output_text_tokens / cache_read_tokens |
 *                        cache / cache_write_5m/1h_tokens | cache_write_tokens).
 *                        Captured verbatim; see live/check.ts to re-capture.
 *   request routing     matrix-probed live per model × surface
 *                        (chat round-trips incl. tool result, /responses with
 *                        function_call, anthropic /v1/messages with tool_use).
 *                        See README "Verified facts".
 *
 * Fields the gateway does NOT publish: `contextWindow`, `maxTokens`, `input`.
 * Until Modelverse documents them, entries carry estimates — marked with
 * `est:` comments, conservative per family. Sibling-informed values (same
 * model family verified on another gateway: DeepSeek-V4 1M/393K, GLM-5 1M/131K,
 * Kimi 262K) are marked "family-informed".
 *
 * Routes are per-entry and single: each id ships exactly one surface, the one
 * that passed the live tool-call matrix. No silent fallbacks.
 *
 * `jev-1.13.0` is deliberately absent: the gateway answers it "400: decisions
 * model, use /api/alpha/decisions" — not a chat model; excluded everywhere
 * (discovery too).
 */

import type { ThinkingLevelMap } from "@earendil-works/pi-ai";

/**
 * Modelverse speaks three protocols on the same key+base:
 *   anthropic-messages  — POST {base-without-/v1}/v1/messages (`x-api-key`)
 *   openai-responses     — POST {base}/responses
 *   openai-completions   — POST {base}/chat/completions
 */
export type GatewayApi = "openai-responses" | "openai-completions" | "anthropic-messages";

/** CNY per 1M tokens, as published by the listing. `cacheRead`: cache read
 *  (ChargeItem `cache_read_tokens` or `cache`); `cacheWrite`: 5-minute write
 *  (`cache_write_5m_tokens`, falling back to plain `cache_write_tokens`). */
export interface CnyPrice {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite?: number;
}

/** Priced input-size band (Modelverse tiers at 272K input for gpt-5.6/6). */
export interface CnyTier extends CnyPrice {
  inputTokensAbove: number;
}

export type ThinkingControl =
  | { kind: "none" }
  | { kind: "effort"; levels: ThinkingLevelMap }
  /** Always-on chain of thought; surfaced when it happens, never toggled. */
  | { kind: "always" };

export interface CatalogEntry {
  id: string;
  name: string;
  api?: GatewayApi;
  contextWindow: number;
  maxTokens: number;
  input: ("text" | "image")[];
  thinking: ThinkingControl;
  cny: CnyPrice;
  cnyTiers?: CnyTier[];
  priceNote?: string;
}

/**
 * Verified on `/responses` 2026-09-24: `reasoning: {effort}` is accepted and
 * changes behavior — `"high"` → reasoning output block, `"none"` → plain
 * message — for every reasoner family probed (mimo, kimi-k3, gpt-6-luna,
 * qwen3.8-max, deepseek-v4.1-flash). Levels low/medium/max are the same knob
 * and follow the OpenAI spelling.
 */
export const MODELVERSE_EFFORT = {
  off: "none",
  minimal: null,
  low: "low",
  medium: "medium",
  high: "high",
  xhigh: null,
  max: "max",
} satisfies ThinkingLevelMap;

/** Sizes reused across entries. */
const CTX_1M = 1_048_576;
const CTX_262K = 262_144;
const CTX_256K = 262_144;
const OUT_393K = 393_216;
const OUT_131K = 131_072;
const OUT_64K = 65_536;
const OUT_32K = 32_768;
const CTX_400K = 409_600;
/** The square's refreshed `MaxModelLenNew: 1000` × 1024 — upstream's "1M". */
const CTX_1000K = 1_024_000;

/** Input-size tier boundary the gateway itself prices at (gpt-5.6/6 family). */
const TIER_272K = 272_000;

export const CATALOG: readonly CatalogEntry[] = [
  // ── Anthropic (native /v1/messages; msg ids start msg_bdrk_ — Bedrock route) ──
  {
    id: "claude-opus-5-5",
    name: "Claude Opus 5.5",
    api: "anthropic-messages",
    // Probed live 2026-09-24: an oversized prompt answers
    // "prompt is too long: 1763030 tokens > 1000000 maximum" — the real cap
    // is 1,000,000 (Anthropic-native phrasing, matched by pi-ai natively).
    contextWindow: 1_000_000,
    maxTokens: OUT_64K, // est
    input: ["text"], // vision over this bridge unverified → keep text-only
    thinking: { kind: "none" }, // anthropic thinking param unprobed; ship without
    cny: { input: 28.8, output: 144, cacheRead: 1.44, cacheWrite: 36 }, // 5m write
    priceNote: "1h cache write is ¥57.6; listed 5m write used for cacheWrite",
  },

  // ── OpenAI-generation models ───────────────────────────────────────────
  {
    // Chat+tools requires reasoning_effort:"none" and /responses is the native
    // surface for tools — routed to responses (probed 2026-09-24).
    // max_output_tokens enforcement on this route is UNVERIFIED: KEY1 (the only
    // key with a grant) hit its spend quota before the check could run.
    id: "gpt-6-luna",
    name: "GPT-6 Luna",
    api: "openai-responses",
    contextWindow: CTX_400K, // est: tier boundary at 272K, "UNLIMIT" band above
    maxTokens: OUT_32K, // advisory/unverified (see note above)
    input: ["text", "image"], // listing SKU: text&image input
    thinking: { kind: "none" }, // reasoning.effort accepted on responses; not wired in v0.1
    cny: { input: 0.72, output: 3.6, cacheRead: 0.072, cacheWrite: 0.9 },
    cnyTiers: [{ inputTokensAbove: TIER_272K, input: 1.44, output: 5.4, cacheRead: 0.144, cacheWrite: 1.8 }],
  },
  {
    id: "gpt-5.6-luna",
    name: "GPT-5.6 Luna",
    api: "openai-completions",
    contextWindow: CTX_400K, // est
    // Advisory only. Probed 2026-09-24: this family IGNORES max_completion_tokens
    // AND max_tokens (cap=8 → 163 generated tokens, finish="stop", not "length"),
    // so the gateway enforces no output cap here and pi's maxTokens cannot bind.
    // Kept at a conservative value so pi's own budget math stays sane.
    maxTokens: OUT_32K,
    input: ["text"], // SKU: text & image input — image path unprobed on chat → text-only is safer for an agent
    thinking: { kind: "none" }, // no reasoning_content in responses; plain chat model
    cny: { input: 1.44, output: 8.64, cacheRead: 0.144, cacheWrite: 1.8 },
    cnyTiers: [{ inputTokensAbove: TIER_272K, input: 2.88, output: 12.96, cacheRead: 0.288, cacheWrite: 3.6 }],
  },
  {
    id: "gpt-5.6-terra",
    name: "GPT-5.6 Terra",
    api: "openai-completions",
    contextWindow: CTX_400K, // est
    maxTokens: OUT_32K, // advisory: family ignores output caps (see gpt-5.6-luna)
    input: ["text"],
    thinking: { kind: "none" },
    // Standard (non-priority) band of the (0, 272K] tier.
    cny: { input: 14.4, output: 86.4, cacheRead: 1.44, cacheWrite: 18 },
    cnyTiers: [{ inputTokensAbove: TIER_272K, input: 28.8, output: 129.6, cacheRead: 2.88, cacheWrite: 36 }],
    priceNote: "service_tier=Priority doubles the price; standard band listed",
  },
  {
    id: "gpt-5.6-sol",
    name: "GPT-5.6 Sol",
    api: "openai-completions",
    contextWindow: CTX_400K, // est
    maxTokens: OUT_32K, // advisory: family ignores output caps (see gpt-5.6-luna)
    input: ["text"],
    thinking: { kind: "none" },
    // Standard 08:00–08:00 (Beijing) band; discounted window until 2026-12-01
    // is ×0.8, Priority ×2.
    cny: { input: 36, output: 216, cacheRead: 3.6, cacheWrite: 45 },
    cnyTiers: [{ inputTokensAbove: TIER_272K, input: 72, output: 324, cacheRead: 7.2, cacheWrite: 90 }],
    priceNote: "discount window ×0.8 until 2026-12-01, Priority ×2; standard band listed",
  },

  // ── Reasoners ───────────────────────────────────────────────────────────
  {
    id: "mimo-v2.6-flash",
    name: "MiMo v2.6 Flash",
    api: "openai-responses",
    // Upstream (Xiaomi MiMo docs mimo.mi.com, updated 2026-09-22, + HF model
    // card): Context Window 1M. The square's legacy `MaxModelLen` still says
    // 131072, but its refreshed `MaxModelLenNew` says 1000 (×1024 = 1,024,000,
    // same shape as mimo-v2.5's window). Live probes agree the old figure was a
    // floor: 240,768 tokens accepted 2026-09-24, 683,309 accepted 2026-09-25
    // with mid+end markers echoed (whole prompt processed); a ~1.02M prompt
    // passed admission with HTTP 200, no `tokens_too_long`. See
    // research/mimo-v26-1m-window-2026-09-25.md.
    contextWindow: CTX_1000K,
    // Square MaxOutputTokens 128 × 1024 = 131072 — matches the live bisection
    // (131072 OK / 131073 "Param Incorrect") and upstream "Maximum Output: 128K".
    maxTokens: 131_072,
    input: ["text", "image"], // listing SKU: text&image&audio&video input
    thinking: { kind: "effort", levels: MODELVERSE_EFFORT },
    cny: { input: 1, output: 2, cacheRead: 0.02 },
  },
  {
    id: "mimo-v2.6-pro",
    name: "MiMo v2.6 Pro",
    api: "openai-responses",
    contextWindow: CTX_1000K, // upstream 1M; square `MaxModelLenNew: 1000` (see flash sibling)
    maxTokens: 131_072, // upstream 128K; square 128 × 1024 (flash sibling bisected live)
    input: ["text", "image"],
    thinking: { kind: "effort", levels: MODELVERSE_EFFORT },
    cny: { input: 3, output: 6, cacheRead: 0.025 },
  },
  {
    id: "deepseek-v4.1-flash",
    name: "DeepSeek V4.1 Flash",
    api: "openai-responses",
    contextWindow: 131_072, // square MaxModelLen (the 1M figure belongs to the -flash sibling)
    // Square advertises 384 × 1024 = 393216 output, but that exceeds the window
    // the same endpoint reports — contradictory vendor data, so capped to the
    // window (pi would otherwise send an invalid max_tokens).
    maxTokens: 131_072,
    input: ["text"],
    thinking: { kind: "effort", levels: MODELVERSE_EFFORT },
    // Peak band (09:00–12:00, 14:00–18:00 Beijing); off-peak is half.
    cny: { input: 2, output: 8, cacheRead: 0.04 },
    priceNote: "off-peak (12:00–14:00, 18:00–09:00 CST) is half price",
  },
  {
    id: "qwen3.8-max",
    name: "Qwen3.8 Max",
    api: "openai-responses",
    contextWindow: 131_072, // square MaxModelLen (also publishes MaxInputTokens 991)
    maxTokens: 131_072, // square 131 × 1024 = 134144, capped to the window
    input: ["text"],
    thinking: { kind: "effort", levels: MODELVERSE_EFFORT },
    cny: { input: 12, output: 36, cacheRead: 1.5, cacheWrite: 15 },
  },
  {
    id: "kimi-k3",
    name: "Kimi K3",
    api: "openai-responses",
    contextWindow: 131_072, // square MaxModelLen
    maxTokens: 131_072, // square advertises 1000 × 1024 = 1M, but the window is 131072
    input: ["text"],
    thinking: { kind: "effort", levels: MODELVERSE_EFFORT },
    cny: { input: 20, output: 100, cacheRead: 2 },
  },

  // ── Chat-completions-only families ─────────────────────────────────────
  {
    // /responses returns 500 convert_request_failed for gemini-3.x (probed
    // 2026-09-24, both keys) — chat completions is the only surface.
    id: "gemini-3.8-flash",
    name: "Gemini 3.8 Flash",
    api: "openai-completions",
    contextWindow: CTX_1M, // est: Gemini norm
    maxTokens: 65_536, // probed live: 65536 OK, 65537 rejected (Gemini maxOutputTokens)
    input: ["text", "image"],
    thinking: { kind: "none" }, // no reasoning_content observed on chat
    cny: { input: 5.4, output: 27, cacheRead: 0.54 },
  },
  {
    id: "gemini-3.7-flash",
    name: "Gemini 3.7 Flash",
    api: "openai-completions",
    contextWindow: CTX_1M, // est
    maxTokens: 65_536, // probed live: 65536 OK, 65537 rejected — family cap
    input: ["text", "image"],
    thinking: { kind: "none" },
    cny: { input: 5.4, output: 27, cacheRead: 0.54 },
  },
  {
    // /responses returns 200 with an empty output array — chat only.
    id: "glm-5.3",
    name: "GLM-5.3",
    api: "openai-completions",
    // The square advertises Responses:true here, but a live probe returned 200
    // with an empty output array — the probe wins; chat-only.
    contextWindow: 131_072, // square MaxModelLen
    maxTokens: 131_072, // square 128 × 1024
    input: ["text"],
    // Reasoning streams as reasoning_content on chat with no toggle verified.
    thinking: { kind: "always" },
    cny: { input: 8, output: 28, cacheRead: 2 },
  },
  {
    // Auto Router: `"model": "auto"` routes to a candidate pool
    // (kimi-k2.6, kimi-k2.7-code, glm-5.2, deepseek-v4-flash/-pro, MiniMax-M3,
    // qwen3.7-plus/-max) and reports the actual model in the response `model`
    // field. Documented: api_doc/text_api/auto-router.md. Cost cannot be pinned
    // (it depends on the chosen model), so it is zero — the router's own usage
    // block still reports the real token counts.
    id: "auto",
    name: "Auto Router",
    api: "openai-completions",
    contextWindow: CTX_262K, // est: smallest candidate window (deepseek-v4 is 1M)
    maxTokens: OUT_32K, // est
    input: ["text"],
    thinking: { kind: "none" },
    cny: { input: 0, output: 0, cacheRead: 0 },
    priceNote: "Auto Router — billed at the routed model's price; not pinnable to ModelCost",
  },
];

/** Fast lookup for discovery's known-id check. */
export const CATALOG_BY_ID: ReadonlyMap<string, CatalogEntry> = new Map(
  CATALOG.map((entry) => [entry.id, entry]),
);
