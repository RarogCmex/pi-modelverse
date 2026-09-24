/**
 * Model-square specs — the gateway's own advertised limits.
 *
 * Found 2026-09-24 via `agent-browser` on the Modelverse model square
 * (astraflow.ucloud.cn/modelverse/playground): the page fetches a public
 * UCloud API that needs **no authentication**
 *
 *   GET https://api.ucloud.cn/?Action=ListUFSquareModelGuest&Limit=…&Offset=…
 *
 * and every entry carries the numbers no other endpoint exposes:
 *
 *   MaxModelLen        context window in tokens (1048576 / 262144 / 204800 / 131072 / 32768)
 *   MaxOutputTokens    output cap in **1024-token units** — verified: 128 → 131072
 *                      (matches the live mimo bisection exactly), 384 → 393216
 *   MaxInputTokens     extra input-side cap where the gateway sets one, else 0
 *   ApiProtocols       {ChatCompletions, Responses, Gemini, Anthropic} — the
 *                      gateway's own protocol matrix (matches the docs' model-competi)
 *
 * Coverage caveat: the guest square lists ~125 **open** models. The proxied
 * frontier models (claude-*, gpt-*, gemini-*) are deliberately absent, so they
 * keep the curated/live-probed numbers. `auto` is absent too (it is a router,
 * not a model entry).
 *
 * Trust level: these are the vendor's advertised specs, not probed limits — a
 * live probe showed mimo accepting 240,768 input tokens despite an advertised
 * MaxModelLen of 131,072, so values are advisory-to-real depending on the model.
 * The overlay uses them in preference to family guesses, and never overrides
 * curated entries.
 */

export interface SquareSpec {
  /** Context window in tokens. */
  contextWindow?: number;
  /** Output cap in tokens (already multiplied out of the 1024-unit field). */
  maxTokens?: number;
  /** Gateway-side input cap when published, else undefined. */
  maxInputTokens?: number;
  /** Protocol flags as published by the square. */
  protocols?: { chat?: boolean; responses?: boolean; gemini?: boolean; anthropic?: boolean };
}

export const SQUARE_ENDPOINT = "https://api.ucloud.cn";
export const SQUARE_ACTION = "ListUFSquareModelGuest";

interface SquareModel {
  Name?: unknown;
  MaxModelLen?: unknown;
  MaxOutputTokens?: unknown;
  MaxInputTokens?: unknown;
  ApiProtocols?: Record<string, unknown>;
}

/** `MaxOutputTokens` is expressed in 1024-token units (verified live). */
const OUTPUT_UNIT = 1024;

function asPositiveInt(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.trunc(value)
    : undefined;
}

/** Parse one square entry into a spec, or undefined when it carries no numbers. */
export function parseSquareModel(entry: SquareModel | undefined): SquareSpec | undefined {
  if (!entry || typeof entry !== "object") return undefined;
  const contextWindow = asPositiveInt(entry.MaxModelLen);
  const rawOutput = asPositiveInt(entry.MaxOutputTokens);
  const maxInputTokens = asPositiveInt(entry.MaxInputTokens);
  const protocolsRaw = entry.ApiProtocols;
  const protocols =
    protocolsRaw && typeof protocolsRaw === "object"
      ? {
          chat: protocolsRaw.ChatCompletions === true,
          responses: protocolsRaw.Responses === true,
          gemini: protocolsRaw.Gemini === true,
          anthropic: protocolsRaw.Anthropic === true,
        }
      : undefined;
  if (!contextWindow && !rawOutput && !maxInputTokens && !protocols) return undefined;
  const spec: SquareSpec = {};
  if (contextWindow) spec.contextWindow = contextWindow;
  if (rawOutput) spec.maxTokens = rawOutput * OUTPUT_UNIT;
  if (maxInputTokens) spec.maxInputTokens = maxInputTokens;
  if (protocols) spec.protocols = protocols;
  return spec;
}

/** Build the id → spec map from a raw square payload. Pure, testable. */
export function parseSquareCatalog(payload: unknown): Map<string, SquareSpec> {
  const out = new Map<string, SquareSpec>();
  const models =
    payload && typeof payload === "object" && Array.isArray((payload as { SquareModels?: unknown }).SquareModels)
      ? ((payload as { SquareModels: unknown[] }).SquareModels as SquareModel[])
      : [];
  for (const entry of models) {
    const name = entry?.Name;
    if (typeof name !== "string" || !name.trim()) continue;
    const spec = parseSquareModel(entry);
    if (spec) out.set(name.trim(), spec);
  }
  return out;
}

/**
 * Fetch the guest square. Never throws; returns `undefined` when unavailable so
 * callers degrade to family guesses. `Limit=300` covers the current 125 entries
 * in one request.
 */
export async function fetchSquareCatalog(
  timeoutMs = 8_000,
  signal?: AbortSignal,
  fetchImpl: typeof fetch = fetch,
): Promise<Map<string, SquareSpec> | undefined> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const url = `${SQUARE_ENDPOINT}/?Action=${SQUARE_ACTION}&Limit=300&Offset=0`;
    const response = await fetchImpl(url, { signal: controller.signal });
    if (!response.ok) return undefined;
    return parseSquareCatalog(await response.json());
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}