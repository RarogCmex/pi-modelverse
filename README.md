# pi-modelverse

Провайдер [Modelverse](https://api.modelverse.cn) (`https://api.modelverse.cn/v1`)
для [pi](https://github.com/earendil-works/pi) coding agent. npm-имя пакета —
`@rarogcmex/pi-modelverse`. Один ключ, три протокола на одном шлюзе:

> **In English.** pi-modelverse registers the UCloud **Modelverse** gateway
> (`api.modelverse.cn`) as a native pi provider. One API key, three wire
> protocols on the same host: Anthropic Messages for Claude, OpenAI Responses
> for the reasoner families, OpenAI Chat Completions for everything else.
> Install with `pi install git:github.com/RarogCmex/pi-modelverse@main`,
> authenticate with `/login modelverse` (or `MODELVERSE_API_KEY`). The catalog
> carries 14 curated ids with prices published in CNY and converted to pi's USD
> `ModelCost`; unknown ids from the live listing are added with the gateway's own
> advertised limits. **Which models you see depends on your key's grants** — see
> «Ключи × модели» below. The rest of this README is in Russian.

| Поверхность | Кому | Почему |
|---|---|---|
| `anthropic-messages` (`/v1/messages`) | Claude | нативный Anthropic-протокол (id ответов `msg_bdrk_…` — Bedrock-маршрут), `x-api-key` |
| `openai-responses` (`/responses`) | mimo, DeepSeek-V4.1, Qwen3.8-Max, Kimi-K3, gpt-6-luna | reasoning-блоки; `reasoning.effort` принят шлюзом и проверен живьём для всех reasoner-семейств, кроме `gpt-6-luna` — у него шлюз effort принимает, но в селектор pi он в v0.1 не заведён (`thinking: none`) |
| `openai-completions` (`/chat/completions`) | gpt-5.6-\*, gemini-3.x, glm-5.x, Auto Router | единственная рабочая поверхность для этих семей |

Расширение регистрирует `modelverse` как полноценный нативный провайдер pi-ai
(`createProvider`), а не как legacy-конфиг: `/login` с валидацией ключа прямо
по грантам, полудинамический каталог (кураторская таблица + семейные эвристики
для новых id) и настоящие цены в CNY.

> ### ⚠️ Не путать с `modelverse.com` — это ДРУГОЙ, не связанный сервис
>
> Плагин работает со шлюзом **UCloud UModelVerse**. Его адреса:
> `api.modelverse.cn` (Китай), `api.umodelverse.ai` (международный) и региональные
> `api-sg` / `api-us-ca` / `api-ge-fra.umodelverse.ai`.
>
> Сайт **`modelverse.com`** — одноимённый, но посторонний проект («open AI evidence
> network»: витрина open-weight моделей с прогонами и Stripe-подписками). У него
> **нет** `/v1/*` API, и его нельзя указывать в `MODELVERSE_BASE_URL`; ключи
> Modelverse там не работают.
>
> Опознать настоящий шлюз: `GET {base}/v1/models` с валидным ключом отдаёт модели
> с `"owned_by": "UCloud_UModelverse"` и id вида `gpt-5.6-luna`, `claude-opus-5-5`,
> `mimo-v2.6-flash`. Дефолт плагина уже правильный — менять ничего не нужно.

## Установка

```bash
pi install git:github.com/RarogCmex/pi-modelverse@main
# или локально
pi install /path/to/pi-modelverse
```

1. Запустите `pi`, выполните `/login modelverse` (или `export MODELVERSE_API_KEY=…`)
   и выберите модель.
2. Проверка (необязательно, тратит квоту ключа): `node live/check.ts`.

> **Требования.** Node ≥ 22.18 (`.ts` исполняется нативным type-stripping'ом, без
> сборки) и установленный pi. `live/check.ts` — инструмент сопровождения: он
> ждёт локальный, не публикуемый файл `secret.env` рядом с корнем репозитория
> со строками `API=…`, `KEY1=…`, `KEY2=…` (широкий ключ и грантовый промо-ключ;
> формат описан в шапке самого скрипта). В свежем клоне такого файла нет —
> скрипт упадёт с понятной ошибкой. Для проверки своего ключа достаточно
> `/login modelverse` внутри pi.

Переменные окружения:

- `MODELVERSE_API_KEY` — ключ (или `/login modelverse`);
- `MODELVERSE_BASE_URL` — переопределение эндпоинта (зеркала/прокси/регионы);
- `MODELVERSE_CNY_PER_USD` — курс CNY→USD для отчётов о стоимости (по умолчанию
  6.7252 — срединный рыночный курс на 2026-09-15; тот же дефолт во всех наших
  плагинах для китайских шлюзов, чтобы отчёты о стоимости были сравнимы).

## Ключи × модели: главный факт этого шлюза

`GET /v1/models` отвечает **разным списком разным ключам** — доступ определяется
грантами ключа, а не глобальным каталогом (проверено живьём 2026-09-24 двумя
ключами: ниже они названы **широкий** и **промо**):

- **широкий ключ**: **277 id** (278 на 2026-09-25 — каталог шлюза растёт), из них после отсева не-чатовых
  модальностей — **140 chat-используемых** (139 моделей + роутер `auto`);
- **грантовый промо-ключ**: **только 7 id** (mimo-v2.6-flash/pro,
  jev-1.13.0, gemini-3.8/3.7-flash, gpt-5.6-luna/terra); запрос к чужой модели
  отвечает `400 No permission to use the model: apikey […] not support model […]`.

Официальное подтверждение — `console/api-key.md` в доках шлюза, раздел
«模型控制»: список моделей задаётся на ключе, и **новые модели не добавляются
в него автоматически** (полный URL — в разделе «Официальная документация» ниже).

Поэтому `/login` валидирует ключ живым запросом и показывает, сколько моделей он
видит, а оверлей `fetchModels` следует именно вашему ключу.

### Пикер моделей фильтруется по грантам ключа

Курируемый каталог — общий для всех ключей, поэтому сам по себе он показывал бы в
пикере модели, которые ключу не выданы (промо-ключ видел `claude-opus-5-5`, `kimi-k3`,
`glm-5.3`, `auto` — и получал на них `400 No permission`). Чтобы этого не было,
провайдер реализует хук pi-ai **`filterModels`**: `Models.getAvailable()` (пикер,
`/model`, `list-models`) применяет его после проверки авторизации — видно только то,
что ключ реально может использовать. Что видно сейчас (живая проверка, 2026-09-25):

| Ключ | Грантов | В пикере | Скрыто |
|---|---|---|---|
| широкий | 278 | **140** (14 курируемых + 126 из оверлея) | ничего |
| промо | 7 | **6** (mimo ×2, gemini ×2, gpt-5.6-luna/terra) | claude-opus-5-5, gpt-6-luna, gpt-5.6-sol, deepseek-v4.1-flash, qwen3.8-max, kimi-k3, glm-5.3, auto |

Как это устроено (`grants.ts`):

- набор грантов ключа записывается из **сырого** листинга `/v1/models` (без отсева
  не-чатовых модальностей — фильтр отвечает на вопрос «можно ли ключу этот id», а не
  «чат ли это»), в двух асинхронных местах: `fetchModels` (обновление при старте) и
  `/login` (проба ключа);
- `filterModels` **синхронный**, поэтому набор реплеится из памяти, а не запрашивается;
  кэш пишется на диск (`$PI_CODING_AGENT_DIR/modelverse-grants.json`, атомарно, mode
  0600, ключи хранятся как SHA-256-отпечатки — сам ключ на диск не попадает) и
  читается синхронно при загрузке расширения, чтобы фильтр работал уже на **первой**
  отрисовке пикера после перезапуска pi;
- **неизвестный ключ → оптимистичный пропуск** (как и оверлей): неудачный листинг не
  должен прятать каталог. Пустой набор — это настоящее наблюдение, и он корректно
  скрывает всё.

Важно: текущая выбранная модель не «выкидывается» — фильтр влияет только на списки
доступных моделей. Смена ключа (`/login`) обновляет кэш сразу, не дожидаясь
следующего обновления каталога.

## Каталог

14 курируемых моделей — по одному проверенному маршруту на id. Цены — из
листинга шлюза, в **CNY за 1M токенов**; pi показывает их пересчитанными в USD
по курсу `MODELVERSE_CNY_PER_USD`. Окна и капы — из официального каталога и
живых проб; оценки помечены «оценка».

| Модель | Поверхность | Контекст | Выход | Мышление | ¥ вход / выход | ¥ cache read / write | Оговорка |
|---|---|---|---|---|---|---|---|
| `claude-opus-5-5` | anthropic | **1M** (измерено живой пробой) | 65 536 (оценка) | нет — параметр Anthropic-thinking не прощупан | 28.8 / 144 | 1.44 / 36 | в `cacheWrite` заложена цена записи 5m; часовая (¥57.6) не моделируется |
| `gpt-6-luna` | responses | 409 600 (оценка) | 32 768 (оценка) | шлюз принимает `reasoning.effort`, в селектор pi не заведено | 0.72 / 3.6 | 0.072 / 0.9 | chat+tools требует `reasoning_effort:"none"` |
| `gpt-5.6-luna` | completions | 409 600 (оценка) | 32 768 (справочно) | нет | 1.44 / 8.64 | 0.144 / 1.8 | выходной кап **игнорируется** шлюзом |
| `gpt-5.6-terra` | completions | 409 600 (оценка) | 32 768 (справочно) | нет | 14.4 / 86.4 | 1.44 / 18 | `service_tier=Priority` удваивает цену |
| `gpt-5.6-sol` | completions | 409 600 (оценка) | 32 768 (справочно) | нет | 36 / 216 | 3.6 / 45 | ×0.8 до 2026-12-01, `Priority` ×2 |
| `mimo-v2.6-flash` | responses | **1 024 000** (upstream 1M; вход ≥683K принят живьём) | **131 072** (измерено бинарным поиском) | effort | 1 / 2 | 0.02 / — | |
| `mimo-v2.6-pro` | responses | **1 024 000** | **131 072** | effort | 3 / 6 | 0.025 / — | |
| `deepseek-v4.1-flash` | responses | 131 072 | 131 072 | effort | 2 / 8 | 0.04 / — | off-peak (12:00–14:00, 18:00–09:00 CST) вдвое дешевле |
| `qwen3.8-max` | responses | 131 072 | 131 072 | effort | 12 / 36 | 1.5 / 15 | шлюз дополнительно ограничивает вход (`MaxInputTokens` 991) |
| `kimi-k3` | responses | 131 072 | 131 072 | effort | 20 / 100 | 2 / — | заявленный вендором кап больше окна — обрезан до окна |
| `gemini-3.8-flash` | completions | 1M (оценка) | **65 536** | нет | 5.4 / 27 | 0.54 / — | `/responses` отвечает 500 |
| `gemini-3.7-flash` | completions | 1M (оценка) | **65 536** | нет | 5.4 / 27 | 0.54 / — | `/responses` отвечает 500 |
| `glm-5.3` | completions | 131 072 | 131 072 | always-on | 8 / 28 | 2 / — | `/responses` отдаёт пустой output |
| `auto` | completions | 262 144 (оценка) | 32 768 (оценка) | нет | 0 / 0 | 0 / — | Auto Router: списывается по цене фактически выбранной модели, поэтому в pi отображается как $0.00 |

**Второй тариф входа.** `gpt-5.6-*` и `gpt-6-luna` тарифицируются полосами: при
входе свыше **272 000 токенов** цена удваивается (`gpt-6-luna` 1.44/5.4,
`gpt-5.6-luna` 2.88/12.96, `-terra` 28.8/129.6, `-sol` 72/324). Плагин передаёт
это в pi как `cost.tiers`, поэтому отчёт о стоимости учитывает полосу.

**Уровни мышления.** pi предлагает семь уровней (`off`, `minimal`, `low`,
`medium`, `high`, `xhigh`, `max`). Для reasoner-моделей на `/responses` карта
такая (`MODELVERSE_EFFORT` в `catalog.ts`, проверено живьём 2026-09-24):

| уровень pi | что уходит в запрос |
|---|---|
| `off` | `reasoning.effort: "none"` — reasoning-блока в ответе нет |
| `low` / `medium` / `high` / `max` | то же имя (орфография OpenAI) — reasoning-блок есть |
| `minimal`, `xhigh` | `null` — уровень **недоступен**, pi его не предлагает |

`glm-5.3` думает всегда и параметров не принимает: в pi это `reasoning: true`
с единственным доступным значением `off → null`, то есть переключателя нет, а
цепочка рассуждений показывается, когда шлюз её присылает. У моделей с
`thinking: none` (`claude-*`, `gpt-*`, `gemini-*`, `auto`) селектора нет вовсе.

Маршруты и цены — только из живых данных и официального листинга; оценки
помечены. Подробности и сырые свидетельства — в `research/`:

- [`research/live-probes-2026-09-24.md`](research/live-probes-2026-09-24.md) —
  матрица поверхностей, tool-round-trip, enforcement капов, окна, квоты;
- [`research/model-square-2026-09-24.md`](research/model-square-2026-09-24.md) —
  полная таблица официального каталога (124 записи) с окнами и капами;
- [`research/mimo-v26-1m-window-2026-09-25.md`](research/mimo-v26-1m-window-2026-09-25.md) —
  окно 1M у mimo-v2.6: upstream-доки Xiaomi, `MaxModelLenNew` в model square,
  живая проба на 683K входных токенов.

### Семейные эвристики (для новых id из оверлея)

- `guessApi`: `auto` → completions (роутер); `claude*` → anthropic;
  `gpt-5|gpt-6|o3*|o4-mini|codex*` → responses; `gpt-5.6*` → completions;
  `mimo|deepseek-v4*|kimi-k[23]|qwen3.[78]` → responses; остальные → completions.
- `guessThinking`: reasoner-семейства на `/responses` получают карту уровней
  `MODELVERSE_EFFORT` (таблица выше), на `/completions` — always-on без
  переключаемых параметров.
- Не-чатовые модальности отрезаются по листингу-аудиту: 277 → 140 (embed/audio/
  realtime/tts/image/video/music/search/translate/docs/batch/digital-twin —
  точный список в `discovery.ts`).
- Региональные id `-sg` (指定地域推理) — обычные chat-id с собственным прайсом;
  проходят через оверлей без спец-обработки.

## Исходящий трафик

Плагин обращается **к двум хостам**, и это стоит знать, если вы аудитируете
трафик или работаете через прокси с белым списком:

| хост | когда | авторизация | зачем |
|---|---|---|---|
| `api.modelverse.cn` (или `MODELVERSE_BASE_URL`) | каждый запрос модели, `GET /v1/models` при обновлении каталога, проба ключа в `/login` | ваш ключ | инференс и листинг |
| `api.ucloud.cn` | **при каждом обновлении списка моделей** | **нет** (публичный метод `?Action=ListUFSquareModelGuest`) | окна/капы/протоколы из официального «model square» — то, чего листинг не публикует |

Второй хост — публичный справочник UCloud, из которого `square.ts` берёт
`MaxModelLen` / `MaxModelLenNew` / `MaxOutputTokens` / `MaxInputTokens` /
`ApiProtocols`. Важные следствия:

- `MODELVERSE_BASE_URL` на него **не влияет** — зеркалируется только основной
  шлюз;
- отдельного выключателя нет; запрос не содержит ни ключа, ни данных сессии
  (только `Action`, `Limit`, `Offset`);
- сбой или недоступность хоста **молча** оставляют прежнее поведение: оверлей
  строится на семейных эвристиках вместо справочных значений (`discovery.ts`
  глотает ошибку, курируемая таблица не затрагивается никогда);
- таймаут запроса — 8 с, прерывается вместе с обновлением каталога.

## Официальная документация

**Канон (есть машиночитаемый markdown):**

- `https://astraflow.ucloud.cn/docs/modelverse` (`/en-us/…` — англ.), API reference:
  `https://astraflow.ucloud.cn/reference/modelverse`;
- **`.md` на любую страницу**: добавьте `.md` к URL страницы, например
  `https://astraflow.ucloud.cn/docs/modelverse/api_doc/text_api/models.md`.
  Часть страниц существует **только в английской локали**: матрица протоколов
  `api_doc/text_api/model-competi` доступна как `/en-us/docs/…/model-competi.md`,
  а китайский путь отдаёт 404;
- **`https://astraflow.ucloud.cn/sitemap.xml`** — карта всего сайта (1079 URL на
  2026-09-29, из них 307 — modelverse в двух локалях); **`/llms.txt`** — там же,
  в корне сайта (под `/docs/modelverse/` обоих файлов нет).

**Первоисточник контента:** `github.com/UCloudDoc-Team/modelverse` (99 `.md`,
обновляется реже сайта).

**Зеркала:** `ucloud-global.com/en/docs/modelverse/modelverse/*`,
`docs.scloudsg.com`, `docs.dezai.com`, `ucdctest-intl.com`.

> ⚠️ **`docs.ucloud.cn/modelverse` не существует.** Проверено 2026-09-24:
> страница рендерит «您访问的页面不存在», при этом HTTP отдаёт `200` (одна
> SPA-оболочка на 8039 байт на любой путь). У реально размещённых продуктов там
> есть `/_sidebar.md`, у modelverse — nginx 404.

### Зашитые в плагин факты из доков

- **Prompt caching.** `X-Session-ID` — header для сродства сессии к инференс-
  инстансу (↑ hit-rate KV-кэша, ↓ TTFT). Отправляется на всех поверхностях:
  anthropic — нативно (`sendSessionAffinityHeaders` + `sessionAffinityFormat:
  "openrouter"` → pi шлёт `x-session-id`), openai — инъекцией fetch
  (`withSessionAffinity`, `provider.ts`). `cache_control` — **только на
  content-блоках** (top-level платформа не признаёт; pi ставит маркеры на блоки
  сам). TTL 5m + опция 1h — это `cache_write_5m/1h_tokens` из прайсинга.
- **Auto Router.** `"model": "auto"` — документированный роутер: выбирает модель из
  пула (kimi-k2.6, kimi-k2.7-code, glm-5.2, deepseek-v4-flash/-pro, MiniMax-M3,
  qwen3.7-plus/-max), фактическую возвращает в `model` ответа; есть `allowed_models`
  и stickiness. Пустой пул → `no available model for auto`.
- **Регионы (指定地域推理).** Суффикс `-sg` в id — ринуется на узел региона и
  тарифицируется по своему прайсу.
- **Контроль ключей.** Ключ может иметь лимит расходов (额度控制) и IP-белый список →
  `permission_error`; `auth_error` — невалидный/отозванный ключ. Оба режима
  описаны в `console/api-key.md` («Api Key 精细化权限控制», добавлено 2026-03-20).
- **`/v1/messages`** поддерживает только Claude-семейство.
- **`max_completion_tokens`** — имя токен-лимита для gpt-семейства (зашито в
  `compat.maxTokensField`).
- **`finish_reason: normal`** — нестандартное значение наряду с `stop`/`length`.

## Обработка ошибок

- **Overflow → компакция.** Шлюз отвечает `tokens_too_long` / «Prompt tokens too
  long», что не матчится ни одним паттерном pi-ai, поэтому `errors.ts` +
  `message_end` добавляют маркер `context_length_exceeded:`. Anthropic-фраза
  `prompt is too long: X > Y maximum` распознаётся pi-ai нативно.
- **Гранты.** `No permission to use the model: apikey … not support model …` →
  понятный текст + персистентная подсказка в конце хода.
- **Квота и IP.** `api key quota exceeded`, `api key ip not in whitelist`,
  `Validate Certification failed` → `clarifyPermissionError` объясняет причину и
  путь решения. Учитывайте: при исчерпанной квоте шлюз считает стоимость до
  инференса и отвергает **любой** запрос — даже заведомо отклоняемый.
- Оверлей никогда не бросает исключений: сбой листинга/каталога оставляет
  кураторский базовый каталог нетронутым. Ключи обрезаются по пробелам; `/login`
  не сохраняет ключ, отвергнутый 401/403.

## Разработка

```bash
node scripts/link-pi.mjs   # один раз: линкует типы pi из глобальной установки
npm run check              # typecheck + офлайн-тесты (сеть мокается)
node live/check.ts         # живые пробы; требует локальный secret.env, тратит квоту
```

**Предварительные условия.** Node ≥ 22.18 (нативный type-stripping: и тесты, и
`live/check.ts` — это `.ts`, который исполняется напрямую). Пакеты pi
(`@earendil-works/pi-ai`, `@earendil-works/pi-coding-agent`, `@types/node`)
зависимостями не объявлены: в рантайме их подменяет загрузчик расширений pi, а
для тайпчека их линкует `scripts/link-pi.mjs`. Скрипт сам находит глобальную
установку pi (префикс npm, nvm, pnpm, `~/.local`, `/usr/local`) и создаёт
симлинки, на Windows — junctions; для конкретного пути:
`PI_ROOT=/path/to/node_modules node scripts/link-pi.mjs`. Проверено на
pi 0.87.1 / pi-ai 0.87.1 / `@types/node` 22.19.19.

`secret.env` (в `.gitignore`, в репозитории отсутствует): `API=…`, `KEY1=…`,
`KEY2=…` — широкий ключ и грантовый промо-ключ. Без него `live/check.ts`
не запускается; офлайн-тесты от него не зависят.

Фикстура `test/fixtures/key2-listing.json` — дословный ответ `GET /v1/models`
грантового ключа (идентификаторы аккаунта заменены синтетическими).

Сборки нет: pi исполняет `.ts` напрямую (`pi.extensions` → `./index.ts`). Всё
кроме `index.ts` импортируется под обычным Node — адаптеры протоколов, живущие
только в compat-энтрипоинте pi-ai, инжектируются из `index.ts`, поэтому тесты
работают без pi.

## Ограничения

- **Окна и капы фронтира не публикуются.** Для `claude-*`, `gpt-*`, `gemini-*`
  шлюз не отдаёт ни окна, ни капа: у `claude-opus-5-5` окно измерено живой
  пробой (1 000 000 — ответ «prompt is too long: … > 1000000 maximum»), у
  остальных стоят оценки, помеченные в таблице. Публичный «model square»
  покрывает только ~125 открытых моделей и проксированных фронтировых id в нём
  нет намеренно.
- **`MaxModelLenNew` не принят на веру.** Обновлённое поле справочника у части
  моделей намекает на 1M там, где устаревшее `MaxModelLen` frozen на 131 072
  (дефолт платформы). На 1M переведён только `mimo-v2.6`: за него говорят и
  upstream-доки Xiaomi, и живая проба на 683 309 входных токенов
  (`research/mimo-v26-1m-window-2026-09-25.md`). `kimi-k3`, `qwen3.8-max`,
  `glm-5.3` и `deepseek-v4.1-flash` остались на 131 072 — ни доков, ни проб на
  этот счёт нет.
- **`ApiProtocols` справочника расходится с живой работой.** Например, mimo не
  заявляет Responses, но он работает. Поэтому числа берутся из справочника, а
  **маршрут — только из живой пробы**.
- **`max_output_tokens` на gpt-семействе не применяется.** Живая проба
  2026-09-24: при `cap=8` модель вернула 163 токена. Значение в таблице —
  справочное, а не ограничение, которое шлюз соблюдает.
- **Кэш-ретеншен и strict schema не заявлены** — compat-флаги выставлены
  консервативно.
- **Второй хост без выключателя.** Обновление каталога обращается к
  `api.ucloud.cn` (см. «Исходящий трафик»); `MODELVERSE_BASE_URL` его не
  перекрывает и отдельного флага, отключающего этот запрос, нет.
- **Слэш-команды `/modelverse` нет.** В v0.1 состояние смотрится через `/login`
  и оверлей каталога.