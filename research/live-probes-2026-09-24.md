# Живые пробы API Modelverse (2026-09-24)

Сырые свидетельства, на которых стоит курируемая таблица и маршрутизация.
Все пробы — против `https://api.modelverse.cn/v1` двумя реальными ключами
(`secret.env`: `KEY1` — широкие гранты, 277 id; `KEY2` — грантовый, 7 id).

## 1. Матрица «поверхность × модель × инструменты»

Метод: минимальный вызов инструмента, где возможно — полный round-trip
(запрос → `tool_call` → результат инструмента → финальный ответ).

| Модель | `/chat/completions` | `/responses` | `/v1/messages` | Итог в каталоге |
| --- | --- | --- | --- | --- |
| `claude-opus-5-5` | round-trip ✅ | 200, нечитаемый body | round-trip ✅ (`msg_bdrk_…`, `tool_use`) | **anthropic** |
| `gpt-6-luna` | требует `reasoning_effort:"none"` для tools | ✅ `function_call` | — | **responses** |
| `gpt-5.6-luna/terra/sol` | round-trip ✅ (3 модели) | ✅ `function_call` (luna) | — | **completions** |
| `mimo-v2.6-flash/pro` | round-trip ✅ (flash) | ✅ `function_call` (обе) | — | **responses** |
| `deepseek-v4.1-flash` | round-trip ✅ | ✅ `function_call` | — | **responses** |
| `qwen3.8-max` | round-trip ✅ | ✅ `function_call` | — | **responses** |
| `kimi-k3` | нет round-trip (без `reasoning_content`) | ✅ `function_call` | — | **responses** |
| `gemini-3.8/3.7-flash` | round-trip ✅ | ❌ 500 `convert_request_failed` | — | **completions** |
| `glm-5.3` | round-trip ✅ | 200, но пустой `output: []` | — | **completions** |
| `deepseek-v4-pro-0813` | round-trip ✅ | — | — | (оверлей, family-guess) |

Не-chat / неработающие: `jev-1.13.0` («decisions model, use /api/alpha/decisions»),
`MiniMax-H3-Max` и `minimax-h3-context-ir` (описаны в листинге KEY1, оба эндпоинта
404) — в `SKIP_MODEL_IDS`.

## 2. `reasoning.effort` на `/responses`

Принят всеми reasoner-семействами (mimo, kimi-k3, gpt-6-luna, qwen3.8-max,
deepseek-v4.1-flash): `high` → блок `reasoning`, `none` → чистое сообщение.
На `/chat/completions` объект `reasoning: {…}` отклоняется (`Unknown parameter:
'reasoning'`); принимается только `reasoning_effort`.

## 3. Лимиты выхода: сначала проверь, чтится ли поле

Проба «дай 8 токенов, а модель просили считать до 50»:

| Модель | Кап=8 → факт | Поле чтится? |
| --- | --- | --- |
| `gemini-3.7/3.8-flash` | `finish=length`, 5 токенов | **да, строго** |
| `mimo-v2.6-flash/pro` | `status=incomplete`, `output_tokens=8` | **да, строго** |
| `gpt-5.6-luna/terra` | `finish=stop`, 163/152 токена | **нет, игнорируется** |

У `gpt-5.6-*` игнорируются и `max_completion_tokens`, и legacy `max_tokens`.
Границы там, где поле работает:

- `mimo-v2.6-flash`: 131072 OK / 131073 → «Param Incorrect»;
- `gemini-3.7/3.8-flash`: 65536 OK / 65537 → «supported range is from 1 (inclusive)
  to 65537 (exclusive)» (граница эксклюзивная → максимум 65536).

## 4. Окна контекста: что реально измерено

| Модель | Значение | Как получено |
| --- | --- | --- |
| `claude-opus-5-5` | **1 000 000** | overflow-ошибка: `prompt is too long: 1763030 tokens > 1000000 maximum` |
| `mimo-v2.6-flash` | ≥ **240 768** | usage.prompt_tokens при успешном ответе (middle-marker контроль) |
| `gpt-5.6-luna` | ≥ **240 755** | usage.prompt_tokens |
| `gemini-3.8-flash` | ≥ **162 967** | usage.prompt_tokens при `max_completion_tokens=1` |

Официальный каталог (см. `model-square-2026-09-24.md`) объявляет mimo `131072`,
но живая проба прожевала 240 768 — т.е. объявленное окно у части моделей **пол, а не
жёсткий кап**. `gemini-3.7/3.8-flash` и `gpt-*` в guest-каталоге отсутствуют.

## 5. Квоты и ключи

Проба с абсурдной капой (`max_completion_tokens: 99000000`) на KEY1:

```
Access forbidden: api key quota exceeded, key_id=uminferapikey-1qo9o56wp6ua,
daily_limit_amount=100 , monthly_limit_amount=0
```

Стоимость оценивается **до** инференса, поэтому при исчерпанной квоте шлюз отвечает
`permission_error` на **любой** запрос — включая заведомо отклоняемые (overflow).
К моменту захвата KEY1 был в состоянии `monthly_limit_amount=0`; KEY2 работал.

Прочие permission-формы (официальная таблица `api_doc/common/api-key.md`):

```
Access forbidden: api key ip not in whitelist, key_id=…, ip=127.0.0.1
401 Validate Certification failed
```

## 6. Прочее

- `finish_reason: normal` — встречается наряду с `stop`/`length` (доки `struct.md`).
- `usage` расширен: `billing_usage`, `input_tokens`, `output_tokens`,
  `claude_cache_creation_5_m_tokens`, `claude_cache_creation_1_h_tokens`.
- Grant-ошибка (живая форма): `No permission to use the model: apikey
  [uminferapikey-1t6eh6bqkggl] not support model [claude-opus-5-5]`.
- `auto` (Auto Router) на ключе без кандидатов: `no available model for auto`.