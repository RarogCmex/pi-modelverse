# pi-modelverse

Провайдер [Modelverse](https://api.modelverse.cn) (`https://api.modelverse.cn/v1`)
для pi coding agent. Один ключ, три протокола на одном шлюзе:

| Поверхность | Кому | Почему |
|---|---|---|
| `anthropic-messages` (`/v1/messages`) | Claude | нативный Anthropic-протокол (id ответов `msg_bdrk_…` — Bedrock-маршрут), `x-api-key` |
| `openai-responses` (`/responses`) | mimo, DeepSeek-V4.1, Qwen3.8-Max, Kimi-K3, gpt-6-luna и OpenAI-поколение | полноценные reasoning-блоки, `reasoning.effort` верифицирован |
| `openai-completions` (`/chat/completions`) | gpt-5.6-\*, gemini-3.x, glm-5.x | единственная рабочая поверхность для этих семей |

Расширение регистрирует `modelverse` как полноценный нативный провайдер pi-ai
(`createProvider`), а не как legacy-конфиг: `/login` с валидацией ключа прямо
по грантам, полудинамический каталог (кураторская таблица + семейные
эвристики для новых id) и настоящие цены в CNY.

> ### ⚠️ Не путать с `modelverse.com` — это ДРУГОЙ, не связанный сервис
>
> Плагин работает с шлюзом **UCloud UModelVerse**. Его адреса:
> `api.modelverse.cn` (Китай), `api.umodelverse.ai` (международный) и региональные
> `api-sg` / `api-us-ca` / `api-ge-fra.umodelverse.ai` — все на домене
> **`umodelverse.ai`** или **`modelverse.cn`**.
>
> Сайт **`modelverse.com`** — одноимённый, но совершенно посторонний проект
> («open AI evidence network» — витрина open-weight моделей с прогонами на железе
> и подпиской через Stripe). У него **нет** `/v1/*` API, он не относится к UCloud,
> и его нельзя указывать в `MODELVERSE_BASE_URL`. Ключи Modelverse там тоже не работают.
>
> Как опознать настоящий шлюз: `GET {base}/v1/models` с валидным ключом отдаёт
> модели с `"owned_by": "UCloud_UModelverse"` и ChatGPT-подобные id
> (`gpt-5.6-luna`, `claude-opus-5-5`, `mimo-v2.6-flash`). Дефолт плагина уже
> указывает на правильный адрес — менять ничего не нужно.

## Установка

1. Добавьте пакет в `packages` в `~/.pi/agent/settings.json`:
   `"../../pi-plugins/pi-modelverse"`
2. Запустите `pi`, выполните `/login modelverse` (или `export
   MODELVERSE_API_KEY=…`) и выберите модель.
3. Проверка: `node live/check.ts` (читает `secret.env`, см. ниже).

Переменные окружения:

- `MODELVERSE_API_KEY` — ключ (или `/login modelverse`);
- `MODELVERSE_BASE_URL` — переопределение эндпоинта (зеркала/прокси);
- `MODELVERSE_CNY_PER_USD` — курс конверсии CNY→USD для отчётов о стоимости
  (по умолчанию 6.7252, как в pi-siliconflow).

## Ключи × модели: главный факт этого шлюза

`GET /v1/models` отвечает **разным списком разным ключам** — доступ определяется
грантами ключа, а не глобальным каталогом (проверено живьём 2026-09-24):

- **широкий ключ** (например `KEY1` из `secret.env`): **277 id** в листинге, из них
  после отсева не-чатовых модальностей — **139 chat-используемых**;
- **«грантовый» промо-ключ** (`KEY2`): **только 7 id** (mimo-v2.6-flash/pro,
  jev-1.13.0, gemini-3.8/3.7-flash, gpt-5.6-luna/terra), запрос к чужой модели
  отвечает `400 No permission to use the model: apikey […] not support model […]`.

Поэтому `/login` валидирует введённый ключ живым запросом и показывает, сколько
моделей он видит; оверлей `fetchModels` тоже следует именно вашему ключу — из
листинга берутся реальные CNY-цены (однодиапазонные), новые id получают
семейные эвристики маршрута/thinking/окон (см. «Семейные эвристики»).

## Официальная документация

**Канонический веб-сайт доков (есть машиночитаемый markdown):**

- `https://astraflow.ucloud.cn/docs/modelverse` (кит.) и
  `https://astraflow.ucloud.cn/en-us/docs/modelverse` (англ.)
- **`.md` на любую страницу**: `GET .../docs/modelverse/api_doc/text_api/models.md` —
  отдаёт чистый markdown (проверено через `agent-browser`: страница реально рендерит
  контент, а `.md`-вариант доступен напрямую). Есть также `sitemap.xml` (1063
  URL, из них сотни под `/docs/modelverse`) и `llms.txt` с точками входа.
- API reference: `https://astraflow.ucloud.cn/reference/modelverse`

**Первоисточник контента:** `https://github.com/UCloudDoc-Team/modelverse`
(99 `.md`; обновляется реже — веб-сайт содержит страницы, которых в репо ещё нет,
например `auto-router`, `model-region`, `openai-batch`, `image_api/midjourney`).

**Зеркала:** `www.ucloud-global.com/en/docs/modelverse/modelverse/*`,
`docs.scloudsg.com/en/docs/modelverse/*`, `docs.dezai.com/en/docs/modelverse/*`,
`www.ucdctest-intl.com/en/docs/modelverse/*`.

> ⚠️ **`docs.ucloud.cn/modelverse` НЕ существует.** Проверено через
> `agent-browser` (страница рендерит «您访问的页面不存在» / page not found), причём
> HTTP всё равно отдаёт `200` (одна SPA-оболочка на 8039 байт на **любой** путь,
> включая заведомо несуществующий). У реально размещённых продуктов на этом хосте
> есть `/_sidebar.md` (напр. `/uhost/_sidebar.md` → 200), а `/modelverse/_sidebar.md`
> → nginx 404. Настоящие доки живут на astraflow/GitHub, не здесь.

> ⚠️ **`modelverse.com` — посторонний проект**, не UCloud (см. врезку в начале).

Ключевые факты из доков, зашитые в плагин:

### Prompt caching (`X-Session-ID` + `cache_control`)

- **`X-Session-ID`** (HTTP-header): платформа старается держать последовательные
  запросы одной сессии на одном инференс‑инстансе — растёт hit-rate локального
  KV-кэша, падает TTFT. Плагин отправляет её на всех трёх поверхностях: anthropic —
  нативно из `ANTHROPIC_COMPAT` (pi шлёт `x-session-id`, тот же header
  case-insensitive), openai — через инъекцию fetch (`withSessionAffinity`, provider.ts).
- **`cache_control`**: только на content-блоках — платформа не поддерживает
  top-level `cache_control`. pi-ai как раз ставит маркеры только на blocks
  (tools/system/messages) — безопасно без правок.
- TTL кэша — 5m (ephemeral) + опция 1h. Это ровно те ChargeItems из прайсинга
  (`cache_write_5m_tokens` / `cache_write_1h_tokens`). `cacheWrite` в каталоге
  использует цену 5m-записи.

### Прочие зашитые факты

- **Auto Router** (`api_doc/text_api/auto-router.md`): `"model": "auto"`
  роутит запрос на пул кандидатов (`kimi-k2.6`, `kimi-k2.7-code`, `glm-5.2`,
  `deepseek-v4-flash/-pro`, `MiniMax-M3`, `qwen3.7-plus/-max`), а фактическую модель
  возвращает в поле `model` ответа. Есть会话粘性 (по system+первому user) и
  `allowed_models`. Поэтому `auto` **не исключён** из каталога, а курируется на
  chat-поверхности; цена не пинуется (0), биллинг — по реально выбранной модели.
  Ключ без кандидатов получает `no available model for auto`.
- **Регионы (指定地域推理, `api_doc/model-region.md`)**: суффикс `-sg` (и др.) в id —
  это指定地域 model IDs `(deepseek-v4-flash-sg, glm-5.2-sg)`: ринуются на узел в регионе
  и тарифицируются по своему прайсу. Оверлей их пропускает как обычные chat-id.
- **`finish_reason: normal`** — шлюз возвращает это значение наряду с `stop`/`length`
  (`struct.md`); pi-ai считает `stop`-подобным, но строка нестандартная — важно при
  чтении сырых ответов.
- **usage расширен** (`billing_usage`, `input_tokens`, `output_tokens`,
  `claude_cache_creation_5_m_tokens`, `claude_cache_creation_1_h_tokens`) — отсюда
  видно 5m/1h кэш-запись Claude прямо в ответе.
- `max_completion_tokens` — единственное поддерживаемое имя токен‑лимита на
  openai-поверхностях для gpt-семейства: зашито в `compat.maxTokensField`.
- `thinking: {type: enabled|disabled|auto}` (DeepSeek-V3.1, **и Doubao** — по
  `thinking/doubao.md`) и `chat_template_kwargs: {thinking: bool}` (V3.2) — есть
  в доках, но в курируемый каталог v0.1 не попали модели с этими требованиями;
  для новых id из оверлея эти форматы НЕ применяются (безопаснее: без
  параметров, чем с неверной формой).
- `/v1/messages` поддерживает только Claude-семейство (claude_compatible.md) —
  `guessApi` это отражает.
- gpt-oss-*, grok-семейство, Qwen/QwQ-поколение — chat-only (матрица протоколов
  model-competi.md) — маршрутизация по умолчанию уже completions.
- Код‑таблица ошибок: `tokens_too_long` / `model_error` / `sensitive_check_error` —
  `errors.ts` покрывает первые два; overflow-фраза «Prompt tokens too long» не
  матчится ни одним паттерном pi-ai, поэтому `message_end` rewrite добавляет
  маркер `context_length_exceeded:` (auto-compaction срабатывает). Anthropic-фраза
  `prompt is too long: X > Y maximum` распознаётся pi-ai нативно.

### Контроль ключей (`api_doc/common/api-key.md`, 2026-03-20)

Официальное подтверждение всей истории с KEY1/KEY2 и два новых класса ошибок:

- **模型控制**: список разрешённых моделей задаётся на ключе в консоли, и новые
  модели **НЕ добавляются автоматически** («如需添加新模型，需要手动添加»). Это
  ровно то, что показал живьём KEY2 (7 id) — и это же значит, что оверлей
  `fetchModels` должен следовать за ключом (он и следует).
- **额度控制**: ключ может иметь дневной/месячный лимит расходов →
  `permission_error` «api key quota exceeded, key_id=…, daily_limit_amount=…»;
  расходы пересчитываются раз в час (т.е. лимит срабатывает с задержкой).
- **IP白名单**: ключ может быть ограничен IPv4-списком → «api key ip not in
  whitelist, key_id=…, ip=…».

Все три формы (плюс старый `auth_error` «Validate Certification failed») теперь
превращаются `clarifyPermissionError` в понятный текст с указанием причины и фикса.

### Если что-то ломается на anthropic-роуте

Официальный гайд Claude Code (`best_practice/claudecode.md`) советует
`CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS=1`: часть экспериментальных beta-фич
Anthropic API на шлюзе не поддерживается. pi шлёт `anthropic-beta` заголовки
только для явно включённых compat-фич — у нас они выключены по умолчанию
(`supportsMidConvoEffort`/`supportsEagerToolInputStreaming` не заданы), так что
те же грабли не задеты; в крайнем случае беta можно погасить вручную через
`model.headers` (pi принимает `anthropic-beta: null`).

### Адреса вне Китая

Кроме `https://api.modelverse.cn` есть зеркала (credential/certificate.md):
`https://api.umodelverse.ai/v1`, а также региональные узлы из quick-start:
`api-sg.umodelverse.ai` (Сингапур), `api-us-ca.umodelverse.ai` (Лос-Анджелес),
`api-ge-fra.umodelverse.ai` (Франкфурт). Любой из них подставляется через
`MODELVERSE_BASE_URL` (anthropic-роут сам срезает `/v1`).

### Живые перепроверки после подключения доков (2026-09-24)

- **claude-opus-5-5: контекст 1 000 000 токенов** (не 200K-оценка) — переполнение
  ответило `prompt is too long: 1763030 tokens > 1000000 maximum`. `contextWindow`
  в каталоге обновлён с est→факт.
- **mimo-v2.6-flash** переварил ~340K токенов на `/responses` без ошибки — каталог
  262K занижен (точную цифру шлюз не публикует).
- **gpt-5.6-luna** принял 240K (usage: prompt_tokens=240755) и продолжил работать.

### Лимиты выхода: СНАЧАЛА надо проверить, чтится ли поле (2026-09-24)

Наивная бисекция `max_completion_tokens` обманывает: шлюз валидирует поле не для всех
семейств. Проба с грантом `8` токенов на промпт «Count from 1 to 50» показала:

| Модель | Кап=8 → что реально произошло | Чтится? |
| --- | --- | --- |
| `gemini-3.8-flash`, `gemini-3.7-flash` | `finish=length`, сгенерировано 5 токенов | **да, строго** |
| `mimo-v2.6-flash`, `mimo-v2.6-pro` (`/responses`) | `status=incomplete`, `output_tokens=8` | **да, строго** |
| `gpt-5.6-luna`, `gpt-5.6-terra` | `finish=stop`, сгенерировано 163/152 токена | **нет — молча игнорируется** |

У `gpt-5.6-*` игнорируется и `max_completion_tokens`, и legacy-`max_tokens` — шлюз не
выставляет у них выходного лимита, значит `maxTokens` для этого семейства только
справочный (для бюджетной математики pi). Аналогично — у `gpt-6-luna`: проверить не
удалось (KEY1 без квоты), помечено как unverified.

Поэтому реальные факты (поле чтится) только там, где оно работает:

| Модель | Диапазон | Вывод |
| --- | --- | --- |
| `mimo-v2.6-flash` | 131072 OK / 131073 → «Param Incorrect» | **131072** |
| `gemini-3.7-flash`, `gemini-3.8-flash` | 65536 OK / 65537 → «supported range is from 1 (inclusive) to 65537 (exclusive)» | **65536** |
| `gpt-5.6-luna` / `-terra` / `-sol` | 1 000 000 «принял» — артефакт игнорирования | лимит не применяется |

Заодно видно: ошибка Gemini называет границу сама и она **эксклюзивная** (`65537
exclusive`), т.е. максимум = 65536 — совпало с бисекцией.

## Верифицированные факты о шлюзе (lab notes, 2026-09-24)

Все пробы — живые запросы с двумя реальными ключами (`secret.env`, `KEY1`/`KEY2`):

- **`jev-1.13.0` не chat-модель** — «a decisions model, use /api/alpha/decisions»;
  исключён везде (SKIP_MODEL_IDS).
- **gpt-6-luna на chat/completions**:rejects `max_tokens` → везде
  `max_completion_tokens`; функция-инструменты не работают вместе с
  reasoning — «use /v1/responses or set reasoning_effort to 'none'» →
  gpt-6-luna маршрутизирован на `/responses`.
- **gemini-3.8/3.7-flash на `/responses`**: HTTP 500 `convert_request_failed` →
  только chat/completions; round-trip с инструментами ✅.
- **glm-5.3 на `/responses`**: 200, но пустой `output: []` → только completions;
  reasoning_content стримится на chat; round-trip ✅.
- **MiniMax-H3-Max / minimax-h3-context-ir**: есть в листинге KEY1, но оба
  эндпоинта 404 — в SKIP_MODEL_IDS.
- **`reasoning.effort` на `/responses`** принят всеми reasoner-семействами
  (mimo, kimi-k3, gpt-6-luna, qwen3.8-max, deepseek-v4.1-flash): `high` →
  reasoning-блок, `none` → чистое сообщение.
- **reasoning_content на chat** стримится у mimo/deepseek/qwen/glm (llama-style
  поля парсятся pi-ai нативно).
- **Тул-коллы**: полный round-trip (вызов → результат инструмента → ответ)
  верифицирован на claude-opus-5-5 (anthropic), gpt-5.6-luna/terra/sol,
  mimo-v2.6-flash, gemini-3.8/3.7-flash, deepseek-v4.1-flash, qwen3.8-max,
  glm-5.3, deepseek-v4-pro-0813; function_call на `/responses` — у gpt-6-luna,
  gpt-5.6-luna, qwen3.8-max, deepseek-v4.1-flash, kimi-k3, mimo-\*.
- **Прайсинг** листинга: CNY за 1M токенов, отдельные ChargeItems
  `input` / `output_text_tokens` / `cache_read_tokens` | `cache` /
  `cache_write_5m_tokens` | `cache_write_1h_tokens` | `cache_write_tokens`.
  Тиражные модели (gpt-5.6/6, порог 272K) и time-of-day/priority/promo
  диапазоны (gpt-5.6-sol, deepseek peak/off-peak) — в каталоге осознанно:
  тарифы стандартного диапазона, см. `priceNote` в `catalog.ts`.

## Каталог

13 курируемых моделей (мартшрут × цена × окна × thinking — по одному
проверенному маршруту на id):

- `claude-opus-5-5` — anthropic; ¥28.8/144, cacheWrite 5m ¥36 (1h ¥57.6 в priceNote);
- `gpt-6-luna` — responses; ¥0.72/3.6, тиры >272K; thinking: none;
- `gpt-5.6-luna` / `-terra` / `-sol` — completions; тиры 272K;
- `mimo-v2.6-flash/pro` — responses; effort-карта (off→`none`, high→`high`);
- `deepseek-v4.1-flash`, `qwen3.8-max`, `kimi-k3` — responses; reasoner-семейства;
- `gemini-3.8-flash`, `gemini-3.7-flash`, `glm-5.3` — completions.

Шлюз не публикует `contextWindow`/`maxTokens`/`input` (в листинге их нет) —
в каталоге стоят оценки (помечены `est`/family-informed в `catalog.ts`).
Цены и маршруты — только из живых данных; ничего не выдумано.

### Семейные эвристики (для новых id из оверлея)

- `guessApi`: `claude*` → anthropic; `gpt-5|gpt-6|o3*|o4-mini|codex*` → responses;
  `gpt-5.6*` → completions; `mimo|deepseek-v4*|kimi-k[23]|qwen3.[78]` → responses;
  `gemini|glm|MiniMax` и прочие → completions.
- `guessThinking`: reasoner-семейства на responses получают полный effort-слектор,
  на completions — always-on без параметров.
- Не-чатовые модальности отрезаются по листингу-аудиту: 277 → 139
  chat-используемых (embed/audio/realtime/tts/image/video/music/search/
  translate/docs/batch/digital-twin — точный список в `discovery.ts`).

## Обработка ошибок

- `No permission to use the model: apikey … not support model …` переписывается
  в понятное сообщение + персистентная подсказка в конце хода: «доступные модели
  зависят от ключа; перечитайте каталог или возьмите ключ с широкими грантами».
- Оверлей никогда не бросает исключений: сбой листинга оставляет кураторский
  базовый каталог и предыдущий оверлей нетронутыми.
- Сохранённые ключи обрезаются по пробелам; `/login` не сохраняет ключ, который
  шлюз отверг 401/403.

## Разработка

```
npm test         # node --test (35 тестов; офлайн, сеть мокается)
npm run typecheck
node live/check.ts   # живые пробы по secret.env
```

`secret.env` (gitignored): `API=…`, `KEY1=…`, `KEY2=…` — ключи для live-проверок.
Фикстура `test/fixtures/key2-listing.json` — дословный ответ `GET /v1/models`
грантового ключа (7 id, полный блок pricing).

Структура повторяет pi-siliconflow: raw `.ts` без сборки (`pi.extensions` →
`./index.ts`), всё кроме `index.ts` работает под обычным Node; адаптеры
протоколов инжектируются из compat-энтрипоинта pi-ai. Симлинки для тайпчека —
см. комментарий в `tsconfig.json`.

## Ограничения / TODO

- `contextWindow`/`maxTokens` — оценки до появления спеков Modelverse.
- Кэш-ретеншен и strict schema не заявлены (compat-флаги консервативны, как у
  pi-siliconflow).
- Слэш-команда `/modelverse` (status/url/models) не завезена — в v0.1 всё
  решается `/login` + оверлеем.

### Экспонирует ли API лимиты выхода явно?

Короткий ответ: **частично, и только через ошибки конкретных апстримов**.

- `GET /v1/models` — не отдаёт ни `contextWindow`, ни `maxTokens` (только id/created/owned_by/pricing);
- `GET /v1beta/models` (gemini-совместимый) — вернул `inputTokenLimit: 0` и `outputTokenLimit: 0` для всех моделей, т.е. **явных чисел нет**, хотя по документации поля есть;
- таблица «max_completion_tokens Value Range», на которую ссылается `openai_compatible.md`, **отсутствует в репозитории доков**;
- единственный случай, где шлюз сам называет точный диапазон — ошибка Gemini-пути:
  `Unable to submit request because it has a maxOutputTokens value of N but the supported
  range is from 1 (inclusive) to 65537 (exclusive)`;
- остальные (mimo, gpt-5.6) либо молчат, либо отдают обобщённое «Param Incorrect».

Т.е. механизм экспонирования — **валидация на границе**, не метаданные. Поэтому
`contextWindow`/`maxTokens` в каталоге остаются гибридом: факт там, где поле чтится и
граница измерена, «est» — в остальных местах.

## Размеры контекста: что удалось выяснить (2026-09-24)

**Да, официальный источник найден** — открытый API каталога моделей, который
тянет страница «模型广场». Найден через `agent-browser` (перехват network):

```
GET https://api.ucloud.cn/?Action=ListUFSquareModelGuest&Limit=300&Offset=0
```

Авторизация **не нужна**. Каждая запись содержит то, чего нет ни в `/v1/models`
(только id/created/owned_by/pricing), ни в `/v1beta/models` (там нули), ни в доках:

| Поле | Смысл |
| --- | --- |
| `MaxModelLen` | Размер контекста в токенах (распределение: 1048576 / 262144 / 204800 / 131072 / 32768) |
| `MaxOutputTokens` | Лимит выхода в **единицах ×1024** — сверено с живой бисекцией: 128 → 131072 ✓, 384 → 393216 ✓ |
| `MaxInputTokens` | Дополнительный лимит входа, где задан (иначе 0) |
| `ApiProtocols` | Собственная матрица протоколов шлюза (`ChatCompletions`/`Responses`/`Gemini`/`Anthropic`) |

Покрытие: ~125 **открытых** моделей (mimo, deepseek, qwen, kimi, glm, MiniMax,
doubao, baidu…). Проксируемого фронтира (claude-\*, gpt-\*, gemini-\*) в guest-каталоге
**нет** — для них остаются курируемые/прожитые цифры.

Плагин использует этот источник в `discovery.ts` → `square.ts`: оверлей обогащает
новые id реальными окнами/капами вместо семейных догадок (сбой fetch — молча
деградирует к догадкам). Курируемые записи уточнены по нему:

- `mimo-v2.6-flash/pro`, `deepseek-v4.1-flash`, `qwen3.8-max`, `kimi-k3`, `glm-5.3`:
  окно **131072** (было est 262144/1M);
- выход у deepseek/kimi в каталоге объявлен больше окна — противоречивые данные
  вендора, кап ограничен окном, чтобы pi не слал невалидный `max_tokens`.

### Где цифр по-прежнему нет

- claude-opus-5-5: окно **1M** — прожито (Anthropic-native ошибка «1763030 tokens >
  1000000 maximum»); выход не измерен;
- gpt-6-luna / gpt-5.6-\*: в guest-каталоге отсутствуют, окно 409600 — оценка;
- gemini-3.7/3.8-flash: выход **65536** прожито (граница из ошибки Gemini), окно 1M — оценка.

### Важная проверка честности источника

Официальный каталог говорит mimo **MaxModelLen=131072**, но живая проба приняла
**240 768** входных токенов (usage.prompt_tokens) и корректно ответила — с
middle-marker контролем (маркер в середине промпта был найден). Значит объявленное
окно у части моделей — **пол, а не жёсткий кап**. Поэтому 131072 у mimo используется
как консервативный «est-пол», а не как факт-предел.
