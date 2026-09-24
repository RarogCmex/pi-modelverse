/**
 * Modelverse provider for pi (https://api.modelverse.cn/v1).
 *
 * Registers `modelverse` as a first-class pi-ai provider: three protocol
 * surfaces on one key (anthropic `/v1/messages` for Claude, OpenAI
 * `/responses` for the reasoners / OpenAI-generation models, OpenAI
 * `/chat/completions` for the rest), a curated CNY catalog with tiered
 * pricing, key-grant-aware live discovery (the /v1/models view differs per
 * credential: 277 ids for a broad key, 7 for a promo key), `/login` with
 * grant validation, `X-Session-ID` scheduling affinity on every surface
 * (per the official prompt-cache guide), and readable rewrites for the
 * gateway's "No permission" and `tokens_too_long` rejections.
 *
 * Routing is per-model and single-surface, cross-checked against the official
 * protocol matrix (github.com/UCloudDoc-Team/modelverse,
 * api_doc/text_api/model-competi.md) and the live tool-call matrix — see the
 * README "Verified facts" section for both.
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
import { clarifyGrantError, normalizeOverflowError } from "./errors.ts";
import { PROVIDER_ID } from "./models.ts";
import { buildModelverseProvider, withSessionAffinity, type ModelverseApis } from "./provider.ts";

export default function (pi: ExtensionAPI) {
  // Provider-scoped, error-stop-guarded rewrites, in order:
  //   1. overflow phrasing → `context_length_exceeded:` so auto-compaction runs
  //      (Modelverse's openai surfaces answer `tokens_too_long` / "Prompt tokens
  //      too long" — see errors.ts; the anthropic route already matches natively)
  //   2. the opaque grant rejection → actionable text naming the fix
  pi.on("message_end", (event) => {
    const message = event.message;
    if (message.role !== "assistant") return;
    if (message.stopReason !== "error") return;
    if (message.provider !== PROVIDER_ID) return;

    const overflow = normalizeOverflowError(message.errorMessage ?? "");
    if (overflow) return { message: { ...message, errorMessage: overflow } };

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

  // OpenAI surfaces get the gateway's recommended `X-Session-ID` scheduling
  // affinity via fetch injection (see provider.ts); the anthropic route gets
  // it natively from ANTHROPIC_COMPAT (models.ts), so it is not wrapped here.
  const api: ModelverseApis = {
    "openai-completions": withSessionAffinity(openAICompletionsApi()),
    "openai-responses": withSessionAffinity(openAIResponsesApi()),
    "anthropic-messages": anthropicMessagesApi(),
  };

  pi.registerProvider(buildModelverseProvider(api));
}
