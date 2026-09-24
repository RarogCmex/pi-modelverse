/**
 * Live model discovery — the dynamic half of a semi-dynamic catalog.
 *
 * `GET /v1/models` on Modelverse answers with a per-credential view: a key
 * with broad grants sees 277 ids, a "granted" promo key sees 7 (probed
 * 2026-09-24 with two real keys). That is a feature for us: the overlay
 * reflects what THIS key can actually use — `fetchModels` re-runs per refresh,
 * pi persists the result through its ModelsStore.
 *
 * The overlay is additive and unknowns-only (same reasoning as pi-siliconflow):
 * known catalog ids keep their curated prices/caps; a live listing must not
 * freeze stale CNY rates into the ModelsStore, and a failed listing must not
 * unregister models.
 *
 * Unlike SiliconFlow, the Modelverse listing embeds full CNY pricing per id,
 * so an unknown id WITH a usable single-band price enters the overlay with
 * real prices instead of zero cost (tiered/promo pricing is skipped — see
 * `extractCnyPrice`).
 */

import type { RefreshModelsContext } from "@earendil-works/pi-ai";
import type { CnyPrice } from "./catalog.ts";
import { CATALOG_BY_ID } from "./catalog.ts";
import { type ModelverseModel, unknownIdToModel, cnyPerUsd } from "./models.ts";
import { fetchSquareCatalog, type SquareSpec } from "./square.ts";

/** Payload of `GET /v1/models`. */
interface ModelsResponse {
  object?: string;
  data?: unknown[];
}

export interface GatewayModelListing {
  id?: unknown;
  owned_by?: unknown;
  pricing?: unknown;
}

/**
 * Non-chat modalities on this gateway, verified against the 277-id listing
 * (audit 2026-09-24: 277 ids → 144 chat-usable): embeddings/rerank, audio/
 * realtime/transcribe, TTS, music (suno/midjourney), image/video generation
 * (wan, kling, vidu, happyhorse, pixverse, seedream/seedance, flux,
 * grok-imagine, gpt-image, qwen-image), web-search tools (exa/doubao),
 * translation (qwen-mt), docs (easydoc), batch variants, digital-twin (LingDT).
 * Chat members of these families (codex, grok, laya, MiniMax) are NOT matched.
 */
const EXCLUDED =
  /(embed|embedding|rerank|bge-|bge$|^BAAI\b|whisper|tts|(^|[-_/])asr($|[-_/])|-audio|audio-|realtime|transcribe|translate|-mt-|qwen-mt|music|suno|midjourney|grok-imagine|gpt-image|qwen-image|seedream|seedance|kling|vidu|wan2|wan3|happyhorse|pixverse|flux-|easydoc|cicada|exa-web|web-search|speech-|-live$|live-|-batch$|lingdt|lip-sync|sound-v2|-image$|IndexTTS|text-to-sound |music-v1)/i;

/**
 * Exact ids that must never auto-register even if they slip past the regex.
 *
 * `auto` is deliberately NOT here: the gateway documents it as the Auto Router
 * (`model: "auto"` picks from a candidate pool and reports the actual model in
 * the response `model` field, api_doc/text_api/auto-router.md). A key whose pool
 * is empty answers "no available model for auto" (model_error) — a grant
 * problem, not a routing one.
 */
export const SKIP_MODEL_IDS = new Set<string>([
  // "a decisions model and cannot be used with the chat/completions endpoint;
  //  use the /api/alpha/decisions endpoint" — not a chat model.
  "jev-1.13.0",
  // Listed with KEY1 but both surfaces 404 (probed 2026-09-24).
  "MiniMax-H3-Max",
  "minimax-h3-context-ir",
]);

/** Pull chat-usable ids out of a `/v1/models` body. Pure, network-free. */
export function parseModelIds(payload: unknown): string[] {
  if (typeof payload !== "object" || payload === null) return [];
  const data = (payload as ModelsResponse).data;
  if (!Array.isArray(data)) return [];
  const ids: string[] = [];
  for (const entry of data) {
    if (typeof entry !== "object" || entry === null) continue;
    const id = (entry as { id?: unknown }).id;
    if (typeof id !== "string" || !id.trim()) continue;
    const trimmed = id.trim();
    if (SKIP_MODEL_IDS.has(trimmed)) continue;
    if (EXCLUDED.test(trimmed)) continue;
    ids.push(trimmed);
  }
  return [...new Set(ids)];
}

type ChargeRow = { ChargeItem?: unknown; Price?: unknown };

/**
 * CNY price extraction for an unknown id, from the listing's embedded pricing.
 *
 * Only single-band "default" pricing is trusted: one Condition block, flat
 * rates. Tiered (gpt-5.6/6 272K bands), time-of-day (deepseek peak/off-peak,
 * gpt-5.6-sol), service_tier=Priority and promo/discount pricing are skipped —
 * mismapping those into pi's `ModelCost` would invent numbers; zero cost
 * reads as $0.00 instead.
 */
export function extractCnyPrice(entry: GatewayModelListing | undefined): CnyPrice | undefined {
  if (!entry || typeof entry !== "object") return undefined;
  const pricing = (entry as { pricing?: unknown }).pricing;
  if (!Array.isArray(pricing) || pricing.length !== 1) return undefined;
  const block = pricing[0] as { Rates?: unknown };
  if (!Array.isArray(block?.Rates)) return undefined;
  const table = new Map<string, number>();
  for (const rate of block.Rates as ChargeRow[]) {
    if (typeof rate !== "object" || rate === null) continue;
    if (typeof rate.ChargeItem !== "string" || typeof rate.Price !== "number") continue;
    table.set(rate.ChargeItem, rate.Price);
  }
  if (!table.has("input") || !table.has("output_text_tokens")) return undefined;
  const cacheRead = table.get("cache_read_tokens") ?? table.get("cache");
  if (typeof cacheRead !== "number") return undefined;
  const price: CnyPrice = {
    input: table.get("input") as number,
    output: table.get("output_text_tokens") as number,
    cacheRead,
  };
  const cacheWrite =
    table.get("cache_write_5m_tokens") ?? table.get("cache_write_tokens") ?? table.get("cache_write_1h_tokens");
  if (typeof cacheWrite === "number" && cacheWrite > 0) price.cacheWrite = cacheWrite;
  return price;
}

/**
 * Overlay for discovered ids: only ids the curated catalog does not know.
 * Known ids are *not* re-emitted — a plugin update to curated prices/caps
 * wins without waiting for the next refresh.
 */
export function buildOverlay(
  entries: readonly GatewayModelListing[],
  baseUrl: string,
  rate: number,
  known: ReadonlySet<string> = new Set(CATALOG_BY_ID.keys()),
  specs?: ReadonlyMap<string, SquareSpec>,
): ModelverseModel[] {
  const payload: ModelsResponse = { data: entries.slice() };
  const ids = parseModelIds(payload);
  const byId = new Map<string, GatewayModelListing>();
  for (const entry of entries) {
    if (entry && typeof entry.id === "string") byId.set(entry.id, entry);
  }
  return ids
    .filter((id) => !known.has(id) && !SKIP_MODEL_IDS.has(id))
    .map((id) => unknownIdToModel(id, extractCnyPrice(byId.get(id)), baseUrl, rate, specs?.get(id)));
}

/** Resolve the bearer token pi's auth layer did not hand us (env-only setups). */
function resolveKey(context: RefreshModelsContext): string | undefined {
  const stored = context.credential;
  if (stored?.type === "api_key" && typeof stored.key === "string" && stored.key.trim()) {
    return stored.key.trim();
  }
  const fromEnv = typeof process !== "undefined" ? process.env?.MODELVERSE_API_KEY : undefined;
  return fromEnv?.trim() ? fromEnv.trim() : undefined;
}

/**
 * `fetchModels` implementation. Never throws: `[]` leaves the curated baseline
 * (and the previously persisted overlay) untouched.
 */
export async function fetchModelverseModels(
  baseUrl: string,
  context: RefreshModelsContext,
  timeoutMs = 8_000,
): Promise<ModelverseModel[]> {
  if (!context.allowNetwork || context.signal.aborted) return [];
  const key = resolveKey(context);
  if (!key) return [];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  context.signal.addEventListener("abort", onAbort, { once: true });

  try {
    const url = `${baseUrl.replace(/\/+$/, "")}/models`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${key}` },
      signal: controller.signal,
    });
    if (!response.ok) return [];
    const listing = await response.json();
    const entries: GatewayModelListing[] =
      typeof listing === "object" && listing !== null && Array.isArray((listing as ModelsResponse).data)
        ? ((listing as ModelsResponse).data as GatewayModelListing[])
        : [];
    // Enrich with the gateway's own model-square specs when reachable (no auth
    // needed): real windows/output caps instead of family guesses. Failure is
    // silent — the overlay then falls back to guesses, i.e. prior behaviour.
    const specs = await fetchSquareCatalog(8_000, context.signal);
    return buildOverlay(entries, baseUrl, cnyPerUsd(), undefined, specs);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
    context.signal.removeEventListener("abort", onAbort);
  }
}
