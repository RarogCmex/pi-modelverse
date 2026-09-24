/**
 * Error-message normalization for the Modelverse gateway.
 *
 * Modelverse's openai surfaces reject an oversized prompt with the official
 * error code `tokens_too_long` and the message "Prompt tokens too long" plus
 * "[User Input Error] The request content exceeds the internal limit of the
 * large model" (error-code table, github.com/UCloudDoc-Team/modelverse,
 * api_doc/common/error-code.md). None of pi-ai's overflow patterns match that
 * phrasing ("/prompt (?:is )?too long/" stops at "prompt is too long";
 * "prompt **tokens** too long" is one word off), so auto-compaction would
 * never fire on the openai routes. The anthropic route needs no help: it
 * surfaces Anthropic-native "prompt is too long: X tokens > Y maximum"
 * (probed live 2026-09-24), which pi-ai matches out of the box.
 *
 * Same contract as pi-siliconflow's errors.ts: add the
 * `context_length_exceeded:` marker so pi's compaction classifier fires.
 * Rate limits must never be rewritten into a compaction trigger.
 */

import { PROVIDER_ID } from "./models.ts";

/**
 * Overflow phrasings this gateway emits (official error-code table + live
 * probes). The anthropic phrasing is included for completeness even though
 * pi already recognizes it — if it already starts with the marker it is
 * returned as null upstream.
 */
const CONTEXT_OVERFLOW_RE =
  /context_length_exceeded|maximum context length|prompt is too long|prompt tokens too long|tokens_too_long|exceeds the internal limit|exceed(?:s|ed)?[^.\n]{0,80}(context|token|length)|input tokens exceed|超出.*?长度|超过.*?长度|too many tokens/i;

const RATE_LIMIT_RE =
  /rate.?limit|too many requests|\b429\b|\bRPM\b|\bTPM\b|\bRPD\b|\bTPD\b|\bquota\b/i;

export function normalizeOverflowError(errorMessage: string): string | null {
  if (!errorMessage) return null;
  if (errorMessage.startsWith("context_length_exceeded")) return null;
  if (RATE_LIMIT_RE.test(errorMessage)) return null;
  if (!CONTEXT_OVERFLOW_RE.test(errorMessage)) return null;
  return `context_length_exceeded: ${errorMessage}`;
}

/**
 * The grant rejection rewrite. Official tables list it as `model_error` /
 * "No permission to use the model" with the apikey/model pair inline; live
 * probes (2026-09-24) show the full form
 * "No permission to use the model: apikey [uminferapikey-…] not support model [claude-opus-5-5]".
 */
const GRANT_ERROR_RE =
  /No permission to use the model: apikey \[(.*?)\] not support model \[(.*?)\]/;

/** Make the opaque grant rejection actionable: name the fix, keep it short. */
export function clarifyGrantError(message: string): string | undefined {
  const match = GRANT_ERROR_RE.exec(message);
  if (!match) return undefined;
  const [, keyId, modelId] = match;
  return (
    `modelverse: ключ [${keyId}] не имеет доступа к модели [${modelId}]. ` +
    `На этом шлюзе доступные модели зависят от ключа (GET /v1/models). ` +
    `Перечитайте каталог (обновление моделей в pi) и выберите модель из него, ` +
    `либо возьмите ключ с более широкими грантами.`
  );
}
