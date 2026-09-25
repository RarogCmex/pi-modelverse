# pi-modelverse

Провайдер [Modelverse](https://api.modelverse.cn) (`https://api.modelverse.cn/v1`)
для pi coding agent. Один ключ, три протокола на одном шлюзе:

| Поверхность | Кому | Почему |
|---|---|---|
| `anthropic-messages` (`/v1/messages`) | Claude | нативный Anthropic-протокол (id ответов `msg_bdrk_…` — Bedrock-маршрут), `x-api-key` |
| `openai-responses` (`/responses`) | mimo, DeepSeek-V4.1, Qwen3.8-Max, Kimi-K3, gpt-6-luna | reasoning-блоки, `reasoning.effort` верифицирован |
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

1. Добавьте пакет в `packages` в `~/.pi/agent/settings.json`:
   `"../../pi-plugins/pi-modelverse"`
2. Запустите `pi`, выполните `/login modelverse` (или `export MODELVERSE_API_KEY=…`)
   и выберите модель.
3. Проверка: `node live/check.ts` (читает `secret.env`).

Переменные окружения:

- `MODELVERSE_API_KEY` — ключ (или `/login modelverse`);
- `MODELVERSE_BASE_URL` — переопределение эндпоинта (зеркала/прокси/регионы);
- `MODELVERSE_CNY_PER_USD` — курс CNY→USD для отчётов о стоимости (по умолчанию
  6.7252, как в pi-siliconflow).

## Ключи × модели: главный факт этого шлюза

`GET /v1/models` отвечает **разным списком разным ключам** — доступ определяется
грантами ключа, а не глобальным каталогом (проверено живьём 2026-09-24):

- **широкий ключ** (`KEY1`): **277 id** (278 на 2026-09-25 — каталог шлюза растёт), из них после отсева не-чатовых
  модальностей — **140 chat-используемых** (139 моделей + роутер `auto`);
- **грантовый промо-ключ** (`KEY2`): **только 7 id** (mimo-v2.6-flash/pro,
  jev-1.13.0, gemini-3.8/3.7-flash, gpt-5.6-luna/terra); запрос к чужой модели
  отвечает `400 No permission to use the model: apikey […] not support model […]`.

Официальное подтверждение — `api_doc/common/api-key.md` («模型控制»): список моделей
задаётся на ключе, и **новые модели не добавляются в него автоматически**.

Поэтому `/login` валидирует ключ живым запросом и показывает, сколько моделей он
видит, а оверлей `fetchModels` следует именно вашему ключу.

### Пикер моделей фильтруется по грантам ключа

Курируемый каталог — общий для всех ключей, поэтому сам по себе он показывал бы в
пикере модели, которые ключу не выданы (`KEY2` видел `claude-opus-5-5`, `kimi-k3`,
`glm-5.3`, `auto` — и получал на них `400 No permission`). Чтобы этого не было,
провайдер реализует хук pi-ai **`filterModels`**: `Models.getAvailable()` (пикер,
`/model`, `list-models`) применяет его после проверки авторизации — видно только то,
что ключ реально может использовать. Что видно сейчас (живая проверка, 2026-09-25):

| Ключ | Грантов | В пикере | Скрыто |
|---|---|---|---|
| `KEY1` (широкий) | 278 | **140** (14 курируемых + 126 из оверлея) | ничего |
| `KEY2` (промо) | 7 | **6** (mimo ×2, gemini ×2, gpt-5.6-luna/terra) | claude-opus-5-5, gpt-6-luna, gpt-5.6-sol, deepseek-v4.1-flash, qwen3.8-max, kimi-k3, glm-5.3, auto |

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

14 курируемых моделей — по одному проверенному маршруту на id, цены из листинга
(CNY), окна/капы из официального каталога и живых проб:

| Модель | Поверхность | Контекст | Выход | Особенность |
|---|---|---|---|---|
| `claude-opus-5-5` | anthropic | **1M** (прожито) | 65 536 est | cacheWrite 5m ¥36 (1h ¥57.6) |
| `gpt-6-luna` | responses | 409 600 est | 32 768 est | chat+tools требует `reasoning_effort:"none"` |
| `gpt-5.6-luna` / `-terra` / `-sol` | completions | 409 600 est | 32 768 справочно | выходной кап **игнорируется** шлюзом |
| `mimo-v2.6-flash` / `-pro` | responses | **1 024 000** (upstream 1M; прожито ≥683K) | **131 072** (бисекция) | effort-карта |
| `deepseek-v4.1-flash` | responses | 131 072 | 131 072 | peak/off-peak цены |
| `qwen3.8-max` | responses | 131 072 | 131 072 | `MaxInputTokens` 991 |
| `kimi-k3` | responses | 131 072 | 131 072 | кап вендора > окна — обрезан |
| `gemini-3.7-flash` / `-3.8-flash` | completions | 1M est | **65 536** | `/responses` → 500 |
| `glm-5.3` | completions | 131 072 | 131 072 | `/responses` → пустой output |
| `auto` | completions | 262 144 est | 32 768 est | Auto Router, цена не пинуется |

Цены и маршруты — только из живых данных; оценки помечены `est`. Подробности и
сырые свидетельства — в `research/`:

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
- `guessThinking`: reasoner-семейства на responses получают effort-слектор,
  на completions — always-on без параметров.
- Не-чатовые модальности отрезаются по листингу-аудиту: 277 → 140 (embed/audio/
  realtime/tts/image/video/music/search/translate/docs/batch/digital-twin —
  точный список в `discovery.ts`).
- Региональные id `-sg` (指定地域推理) — обычные chat-id с собственным прайсом;
  проходят через оверлей без спец-обработки.

## Официальная документация

**Канон (есть машиночитаемый markdown):**

- `https://astraflow.ucloud.cn/docs/modelverse` (`/en-us` — англ.), API reference:
  `https://astraflow.ucloud.cn/reference/modelverse`;
- **`.md` на любую страницу**: `.../docs/modelverse/api_doc/text_api/models.md`;
- `sitemap.xml` (~1063 URL) и `llms.txt`.

**Первоисточник контента:** `github.com/UCloudDoc-Team/modelverse` (99 `.md`,
обновляется реже сайта).

**Зеркала:** `ucloud-global.com/en/docs/modelverse/modelverse/*`,
`docs.scloudsg.com`, `docs.dezai.com`, `ucdctest-intl.com`.

> ⚠️ **`docs.ucloud.cn/modelverse` не существует.** Проверено `agent-browser`:
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
  `permission_error`; `auth_error` — невалидный/отозванный ключ.
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

```
npm test         # node --test — 70 тестов, офлайн, сеть мокается
npm run typecheck
node live/check.ts   # живые пробы по secret.env (quota-aware)
```

`secret.env` (gitignored): `API=…`, `KEY1=…`, `KEY2=…`.
Фикстура `test/fixtures/key2-listing.json` — дословный ответ `GET /v1/models`
грантового ключа.

Структура повторяет pi-siliconflow: raw `.ts` без сборки (`pi.extensions` →
`./index.ts`); всё кроме `index.ts` работает под обычным Node; адаптеры протоколов
инжектируются из compat-энтрипоинта pi-ai. Симлинки для тайпчека — см. комментарий
в `tsconfig.json`.

## Ограничения / TODO

- Окна/капы фронтира (`claude-*`, `gpt-*`, `gemini-*`) шлюз не публикует: у claude
  окно прожито (1M), у остальных — оценки. Guest-каталог покрывает только ~125
  открытых моделей.
- `ApiProtocols` из guest-каталога расходится с живой работой (mimo: каталог не
  заявляет Responses, а он работает) — числа берём из каталога, **маршрут только из
  живой пробы**.
- Legacy-поле `MaxModelLen` в guest-каталоге у части моделей — устаревшая
  заглушка 131072 (mimo-v2.6, kimi-k3, glm-5.3, deepseek-v4.1-flash, qwen3.7/3.8…);
  обновлённое `MaxModelLenNew` (×1024) у них несёт 1M. `square.ts` читает New с
  приоритетом; в курируемой таблице на 1M переведён только mimo-v2.6 (upstream-доки
  + живая проба ≥683K, см. `research/mimo-v26-1m-window-2026-09-25.md`). Остальные —
  кандидаты на верификацию.
- Кэш-ретеншен и strict schema не заявлены (compat-флаги консервативны).
- Слэш-команда `/modelverse` (status/url/models) не завезена — в v0.1 всё решается
  `/login` + оверлеем.