/**
 * Modelverse provider for pi (https://api.modelverse.cn/v1).
 *
 * Registers `modelverse` as a first-class pi-ai provider: three protocol
 * surfaces on one key (anthropic `/v1/messages` for Claude, OpenAI
 * `/responses` for the reasoners / OpenAI-generation models, OpenAI
 * `/chat/completions` for the rest), a curated CNY catalog with tiered
 * pricing, key-grant-aware live discovery (the /v1/models view differs per
 * credential: 277 ids for a broad key, 7 for a promo key), `/login` with
 * grant validation, and a readable turn-end hint for the gateway's
 * "No permission to use the model" rejections.
 *
 * Routing is per-model and single-surface: each id ships the one surface that
 * passed the live tool-call matrix (README "Verified facts"). No before_provider_request
 * payload rewriting is needed — every quirk found so far is expressed as a
 * compat flag on the model (maxTokensField, reasoning gating) instead of a hook.
 */

// NOTE on this import: pi's extension loader aliases the bare
// "@earendil-works/pi-ai" specifier to pi-ai's compat entrypoint, which
// re-exports the protocol adapters (`openAICompletionsApi`,
// `openAIResponsesApi`, `anthropicMessagesApi`). Subpaths other than /compat,
// /oauth and /providers/all are NOT aliased. tsconfig.json mirrors the alias
// so `npm run typecheck` sees what pi sees. This is the only pi-runtime-only
// module boundary in the package (same contract as pi-siliconflow).
import { anthropicMessagesApi, openAICompletionsApi, openAIResponsesApi } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { PROVIDER_ID } from "./models.ts";
import { buildModelverseProvider, type ModelverseApis } from "./provider.ts";

/** Make the opaque grant rejection actionable: name the fix, keep it short. */
function clarifyGrantError(message: string): string | undefined {
  const match = /No permission to use the model: apikey \[(.*?)\] not support model \[(.*?)\]/.exec(message);
  if (!match) return undefined;
  const [, keyId, modelId] = match;
  return (
    `modelverse: ключ [${keyId}] не имеет доступа к модели [${modelId}]. ` +
    `На этом шлюзе доступные модели зависят от ключа (GET /v1/models). ` +
    `Перечитайте каталог (обновление моделей в pi) и выберите модель из него, ` +
    `либо возьмите ключ с более широкими грантами.`
  );
}

export default function (pi: ExtensionAPI) {
  // Provider-scoped, error-stop-guarded rewrite of the grant rejection.
  pi.on("message_end", (event) => {
    const message = event.message;
    if (message.role !== "assistant") return;
    if (message.stopReason !== "error") return;
    if (message.provider !== PROVIDER_ID) return;
    const clarified = clarifyGrantError(message.errorMessage ?? "");
    if (!clarified) return;
    return { message: { ...message, errorMessage: clarified } };
  });

  // Persistent actionable boundary entry, deduped by customType.
  pi.on("turn_end", (event) => {
    if (event.outcome !== "error") return;
    const msg = event.message as unknown as {
      role: string;
      stopReason?: string;
      provider?: string;
      errorMessage?: string;
    };
    if (msg?.stopReason !== "error" || msg?.provider !== PROVIDER_ID) return;
    const clarified = clarifyGrantError(msg.errorMessage ?? "");
    if (!clarified) return;
    if (event.entries.some((e) => (e as { customType?: string }).customType === "modelverse-grant-help"))
      return;
    return {
      entries: [
        ...event.entries,
        {
          type: "custom_message",
          customType: "modelverse-grant-help",
          content:
            clarified +
            " Также проверьте, что модель существует в каталоге: `/login modelverse` показывает, сколько моделей выдано ключу.",
          display: true,
        },
      ],
    };
  });

  const api: ModelverseApis = {
    "openai-completions": openAICompletionsApi(),
    "openai-responses": openAIResponsesApi(),
    "anthropic-messages": anthropicMessagesApi(),
  };

  pi.registerProvider(buildModelverseProvider(api));
}
