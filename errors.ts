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
 * Contract: add the `context_length_exceeded:` marker so pi's compaction
 * classifier fires.
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

/**
 * Key-level permission failures beyond the model-grant case (official
 * "API Key 精细化权限控制" doc, console/api-key.md, feature added 2026-03-20):
 *
 *   Access forbidden: api key quota exceeded, key_id=…, daily_limit_amount=100,
 *     monthly_limit_amount=1000
 *   Access forbidden: api key ip not in whitelist, key_id=…, ip=127.0.0.1
 *
 * Both are `permission_error`/`forbidden` and read like an auth bug; name the
 * actual cause instead. Also cover the older `auth_error` shape
 * ("Validate Certification failed").
 */
const KEY_QUOTA_RE = /api key quota exceeded[^\n]*?key_id=([\w-]+)[^\n]*?daily_limit_amount=([\d.]+)[^\n]*?monthly_limit_amount=([\d.]+)/;
const KEY_IP_RE = /api key ip not in whitelist[^\n]*?key_id=([\w-]+)[^\n]*?ip=([\w:.]+)/;
const AUTH_FAILED_RE = /Validate (?:Certification|Authentication) failed|invalid_token/i;

/** Actionable text for key-level permission/auth failures, or undefined. */
export function clarifyPermissionError(message: string): string | undefined {
  const quota = KEY_QUOTA_RE.exec(message);
  if (quota) {
    const [, keyId, daily, monthly] = quota;
    return (
      `modelverse: ключ [${keyId}] исчерпал лимит расходов (дневной ${daily}, месячный ${monthly}). ` +
      `Лимит задаётся в консоли Modelverse при создании/правке API Key (额度控制, Api Key 精细化权限控制). ` +
      `Увеличьте лимит или смените ключ; учтите, что расходы пересчитываются раз в час.`
    );
  }
  const ip = KEY_IP_RE.exec(message);
  if (ip) {
    const [, keyId, sourceIp] = ip;
    return (
      `modelverse: ключ [${keyId}] разрешён только с IP из белого списка, а запрос пришёл с ${sourceIp}. ` +
      `Добавьте IP в whitelist ключа в консоли Modelverse или используйте ключ без IP-ограничения.`
    );
  }
  if (AUTH_FAILED_RE.test(message)) {
    return (
      `modelverse: ключ невалиден/отозван (шлюз ответил: ${message.trim()}). ` +
      `Проверьте ключ в консоли Modelverse и повторно выполните /login modelverse или обновите MODELVERSE_API_KEY.`
    );
  }
  return undefined;
}
