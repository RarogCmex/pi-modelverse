/**
 * Provider assembly.
 *
 * Split out from `index.ts` so it can be imported and tested under plain Node:
 * everything here resolves through pi-ai's core entrypoint. The symbols that
 * live only in the compat entrypoint (the protocol adapters) are injected by
 * `index.ts` instead of imported here — same contract as pi-siliconflow.
 */

import {
  createProvider,
  envApiKeyAuth,
  type ApiKeyAuth,
  type AuthInteraction,
  type Provider,
  type ProviderStreams,
} from "@earendil-works/pi-ai";
import { fetchModelverseModels } from "./discovery.ts";
import {
  buildModels,
  cnyPerUsd,
  DEFAULT_BASE_URL,
  PROVIDER_ID,
  type GatewayApi,
} from "./models.ts";

/**
 * All three surfaces are registered; each catalog/overlay entry pins its own
 * single route, so a stray `api` never falls through to an unprobed surface.
 */
export type ModelverseApis = {
  "openai-completions": ProviderStreams;
  "openai-responses": ProviderStreams;
  "anthropic-messages": ProviderStreams;
};

export const API_KEY_AUTH_NAME = "Modelverse API key";
export const API_KEY_ENV_VAR = "MODELVERSE_API_KEY";
export const BASE_URL_ENV_VAR = "MODELVERSE_BASE_URL";

type EnvReader = (name: string) => string | undefined;

const processEnv: EnvReader = (name) =>
  typeof process !== "undefined" ? process.env?.[name] : undefined;

/** Endpoint override for mirrors/proxies. Default: the public gateway. */
export function resolveBaseUrl(env: EnvReader = processEnv): string {
  const trimmed = env(BASE_URL_ENV_VAR)?.trim().replace(/\/+$/, "");
  return trimmed ? trimmed : DEFAULT_BASE_URL;
}

export interface GrantProbeResult {
  ok: boolean;
  status: number;
  granted: number;
  sample: string[];
}

/**
 * Validate a candidate key by listing what it grants. This is the same call
 * the discovery overlay uses, so `/login` doubles as the "which key works
 * with which models" answer: a broad key reports ~277 ids, a promo key
 * reports its handful.
 */
export async function probeGrants(
  key: string,
  baseUrl: string,
  timeoutMs = 10_000,
  fetchImpl: typeof fetch = fetch,
): Promise<GrantProbeResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`${baseUrl.replace(/\/+$/, "")}/models`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: controller.signal,
    });
    let granted = 0;
    let sample: string[] = [];
    if (response.ok) {
      const listing = (await response.json()) as { data?: { id?: unknown }[] };
      const ids = Array.isArray(listing?.data)
        ? listing.data.map((entry) => entry.id).filter((id): id is string => typeof id === "string")
        : [];
      granted = ids.length;
      sample = ids.slice(0, 5);
    }
    return { ok: response.ok, status: response.status, granted, sample };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Stored-key-then-env auth (`/login` → `MODELVERSE_API_KEY`), with a Modelverse
 * twist: the entered key is validated against the gateway and the grant count
 * is surfaced in the login flow — that count is the real key→model mapping on
 * this gateway, not a fixed catalog.
 */
export function modelverseApiKeyAuth(
  baseUrl: string,
  fetchImpl: typeof fetch = fetch,
): ApiKeyAuth {
  const base = envApiKeyAuth(API_KEY_AUTH_NAME, [API_KEY_ENV_VAR]);
  return {
    ...base,

    async login(interaction: AuthInteraction) {
      interaction.signal?.throwIfAborted();
      const entered = await interaction.prompt({
        type: "secret",
        message: API_KEY_AUTH_NAME,
        placeholder: "modelverse key",
      });
      interaction.signal?.throwIfAborted();
      const key = entered.trim();
      if (!key) throw new Error("No API key entered.");

      let hint: string;
      let probe: GrantProbeResult | undefined;
      try {
        probe = await probeGrants(key, baseUrl, 10_000, fetchImpl);
      } catch (error) {
        // Network problems must not block saving the key; save without validation.
        interaction.notify({
          type: "info",
          message: `Could not validate the key against the gateway (${(error as Error).message}). Saving it anyway.`,
        });
        return { type: "api_key", key };
      }
      if (!probe.ok) {
        // A key the gateway answers 401 for must not be saved silently.
        throw new Error(
          `Gateway rejected the key (HTTP ${probe.status}). Check the key in the Modelverse console and retry /login.`,
        );
      }
      hint =
        probe.granted > 0
          ? `Key accepted: ${probe.granted} models granted (e.g. ${probe.sample.join(", ")}). The model picker and discovery overlay follow this key.`
          : "Key accepted, but the listing returned 0 models — nothing will be usable.";
      interaction.notify({ type: "info", message: hint });
      return { type: "api_key", key };
    },

    async resolve(input) {
      const resolved = await base.resolve(input);
      const key = resolved?.auth.apiKey?.trim();
      if (!resolved || !key) return undefined;
      return { ...resolved, auth: { ...resolved.auth, apiKey: key } };
    },
  };
}

export function buildModelverseProvider(
  api: ModelverseApis,
  baseUrl: string = resolveBaseUrl(),
): Provider<GatewayApi> {
  return createProvider<GatewayApi>({
    id: PROVIDER_ID,
    name: "Modelverse",
    baseUrl,
    auth: { apiKey: modelverseApiKeyAuth(baseUrl) },
    models: buildModels(baseUrl, cnyPerUsd(processEnv)),
    fetchModels: (context) => fetchModelverseModels(baseUrl, context),
    api,
  });
}
