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
