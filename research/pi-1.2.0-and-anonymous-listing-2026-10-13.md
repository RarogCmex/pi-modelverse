# Проверка на pi 1.2.0 и дрейф анонимного листинга — 2026-10-13

Сырые свидетельства к двум выводам, внесённым в README в этот день:

1. pi 1.2.0 отдаёт в контекст обновления каталога **эффективный** base URL
   провайдера — оверлей должен брать его, а не адрес регистрации;
2. `GET /v1/models` на шлюзе больше не отклоняет мусорный ключ — он отвечает
   `200` и публичным дефолтным списком, на чём раньше строилась валидация
   `/login`.

Окружение: pi 1.2.0 / pi-ai 1.2.0 / `@types/node` 26.6.5 (линкуются
`scripts/link-pi.mjs`), Node v26.10.0, macOS. Ключи в файл не копируются.

## 1. pi 1.2.0: `RefreshModelsContext.baseUrl`

Новое поле в типах pi-ai 1.2.0 (`models.d.ts`):

```ts
/**
 * Base URL of the registered provider, including configuration overrides that wrappers apply
 * outside the provider receiving this context.
 */
baseUrl?: string;
```

pi-ai кладёт туда `provider.baseUrl` составленного провайдера
(`pi-ai/dist/models.js:172`), а композитор pi берёт его как
`extension?.baseUrl ?? config?.baseUrl ?? base?.baseUrl`
(`pi-coding-agent/dist/core/provider-composer.js:392`) — то есть
`providers.modelverse.baseUrl` из `models.json` туда попадает.

### Проверка живьём (локальное зеркало)

`models.json` в отдельном `$PI_CODING_AGENT_DIR`:

```json
{
  "$schema": "https://pi.dev/schemas/models.schema.json",
  "providers": { "modelverse": { "baseUrl": "http://127.0.0.1:8799/v1" } }
}
```

Мокированное зеркало на `127.0.0.1:8799` отвечает на `GET /v1/models` списком
из одного курируемого id (`mimo-v2.6-flash`) и одного неизвестного каталогу
(`mimo-v3.0-pro`) и пишет лог запросов. Запуск — TUI под pty с открытием
`/model` (селектор дожидается сетевого обновления каталога; `--list-models` и
`-p` отрабатывают только офлайн-фазу `allowNetwork: false` и обновлений не
делают — это поведение pi, оно не менялось).

**До изменения** (`discovery.ts` берёт адрес регистрации):

```
mirror saw: (ничего — листинг ушёл на api.modelverse.cn)
mimo-v3.0-pro в пикере: False
```

**После изменения:**

```
{"allowNetwork":false,"ctxBaseUrl":"http://127.0.0.1:8799/v1","hasStored":false}
{"allowNetwork":true, "ctxBaseUrl":"http://127.0.0.1:8799/v1","hasStored":false}
{"allowNetwork":true, "ctxBaseUrl":"http://127.0.0.1:8799/v1","hasStored":true}
mirror saw: GET /v1/models x-session-id=-   (×2 — на две сетевые фазы)
mimo-v3.0-pro в пикере: True
```

Запись оверлея в `models-store.json` несёт адрес зеркала, то есть неизвестный id
вызываем через него:

```json
{ "modelverse": { "models": [ {
  "id": "mimo-v3.0-pro", "api": "openai-responses", "provider": "modelverse",
  "baseUrl": "http://127.0.0.1:8799/v1", "reasoning": true, ...
```

Гранты ключа записаны с того же листинга
(`modelverse-grants.json` → отпечаток ключа, `ids: ["mimo-v2.6-flash",
"mimo-v3.0-pro"]`).

Побочно подтверждено на 1.2.0: `X-Session-ID` уходит на поверхность
`/responses` (`POST /v1/responses x-session-id=01a134b2-…`), а загрузка
расширения даёт те же 14 курируемых моделей
(`PI_CODING_AGENT_DIR=/tmp/… MODELVERSE_API_KEY=<неизвестный ключ> pi -ne -e <репа> --offline --list-models modelverse`);
с рабочим промо-ключом в `auth.json` тот же список сужается до 6 — фильтр по
грантам работает.

`npm run check`: 75/75 (два новых теста на `resolveRefreshBaseUrl` и на
`fetchModelverseModels` с `context.baseUrl`). Typecheck чистый и на tsc
7.1.0-dev, и на запинненном в CI 5.9.3.

## 2. Шлюз: анонимный листинг больше не отклоняется

Пробы 2026-10-13, `https://api.modelverse.cn/v1/models`:

| Запрос | HTTP | Ответ |
|---|---|---|
| без `Authorization` | `200` | 375 886 байт, `data` из **128** id |
| `Authorization: Bearer not-a-key-at-all` | `200` | те же 375 886 байт, те же 128 id |
| `Authorization: Bearer <мусор, другой формы>` | `200` | те же 128 id |
| валидный промо-ключ | `200` | **7** id (mimo-v2.6-flash/pro, jev-1.13.0, gemini-3.8/3.7-flash, gpt-5.6-luna/terra) |

Первый id публичного списка — `doubao-seed-2-1-lite-260915`, `owned_by` у всех
`UCloud_UModelverse`.

Сравнение с пробой 2026-09-24 (`live-probes-2026-09-24.md`): тогда листинг был
строго пер-ключевым (широкий 277 id, промо 7 id), и `probeGrants` рассчитывал на
`401` для ключа, который шлюз не принимает — на этом стоит `/login` («Gateway
rejected the key (HTTP …)») и запись грантов.

Что это значит сейчас:

- **Пер-ключевая фильтрация не сломана**: валидный ключ по-прежнему видит свой
  набор (7 против 128 анонимных), `filterModels` и оверлей работают как раньше;
- **валидация `/login` ослабла**: мусорный ключ получает `200`, сохраняется с
  подсказкой «128 models granted», а в кэш грантов пишется публичный дефолт —
  после чего пикер показывает модели, на которых первый же запрос отвечает
  `No permission to use the model` (текст плагин переписывает в понятный,
  см. `errors.ts`);
- возможное лечение (не реализовано): в `probeGrants` дополнительно снимать
  анонимный листинг и считать ключ непрошедшим проверку, когда набор id совпадает
  с публичным дефолтом; либо валидировать ключ запросом, который действительно
  требует авторизации.
