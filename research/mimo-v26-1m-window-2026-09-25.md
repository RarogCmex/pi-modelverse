# MiMo v2.6: окно контекста 1M — свидетельства (2026-09-25)

Курируемый каталог нёс для `mimo-v2.6-flash` / `mimo-v2.6-pro` окно **131 072**
(legacy-поле `MaxModelLen` из model square). Проверка показала: это устаревшая
заглушка, настоящее окно — **1M** (1 024 000). Выходной кап **131 072** остаётся
(подтверждён бисекцией 2026-09-24 и upstream-доками).

## 1. Upstream: официальная документация Xiaomi MiMo

`https://mimo.mi.com/docs/en-US/quick-start/summary/model` (Update Time:
**September 22, 2026**) — таблица Text Generation Model, дословно:

| Model ID | Length limits (token) | Rate limits |
| --- | --- | --- |
| `mimo-v2.6-pro` `mimo-v2.6-flash` `mimo-v2.5` (to be deprecated) | **Context Window: 1M, Maximum Output: 128K** | RPM 100, TPM 10M |
| `mimo-v2.6-pro-ultraspeed` | **Context Window: 1M, Maximum Output: 128K** | customized |

Карточки моделей (`mimo.mi.com/models/en-US/mimo-v2.6-flash`): «Context Window
**1M tokens**, Max Output **128K tokens** … 1M-token context window, suited for
mixed-modality input and multi-agent collaboration».

HuggingFace `XiaomiMiMo/MiMo-V2.6-Flash-RL` (model card): «**Context Length:
1M tokens**», «Max Context Length | 1M»; архитектура Sparse MoE 309B total /
15B activated. Анонс серии (SiliconANGLE, 2026-09-22): «native omnimodal …
with **1 million-token context windows**».

## 2. Model square: поле `MaxModelLen` устарело, есть `MaxModelLenNew`

Повторный захват `GET https://api.ucloud.cn/?Action=ListUFSquareModelGuest&Limit=300&Offset=0`
(2026-09-25, без авторизации). Записи xiaomi:

| id | MaxModelLen (legacy) | **MaxModelLenNew** (×1024) | MaxOutputTokens (×1024) | UpdateAt |
| --- | --- | --- | --- | --- |
| `mimo-v2.6-pro` | 131072 | **1000 → 1 024 000** | 128 → 131 072 | 2026-09-22 |
| `mimo-v2.6-flash` | 131072 | **1000 → 1 024 000** | 128 → 131 072 | 2026-09-22 |
| `mimo-v2.5` | 1024000 | 1000 → 1 024 000 | 131 → 134 144 | 2026-08-20 |
| `mimo-v2.5-pro` | 1024000 | 1000 → 1 024 000 | 128 → 131 072 | 2026-06-01 |

Оба v2.6-релиза обновлены **2026-09-22** — в день анонса серии; legacy-поле
при этом не пересчитали (осталось 131072), а v2.5-записи несут 1 024 000 ещё и
в legacy. `1000 × 1024 = 1 024 000` — та же форма записи «1M», что у v2.5.

Аудит единицы измерения `MaxModelLenNew` (весь каталог, 124 записи):
единицы — те же «×1024», что у `MaxOutputTokens` (128 → 131072 подтверждено
живой бисекцией 2026-09-24). Значения New: 8, 16, 32, 80, 128, 200, 256,
1000, 1024. Из 57 записей, где присутствуют оба поля:

- **27** — `New × 1024` точно равен legacy (200→204800 ×11, 128→131072 ×3,
  32→32768 и др.) — единица измерения подтверждена;
- **30** — расходятся, причём в **25** из них legacy равен дефолтной заглушке
  платформы **131072** (mimo-v2.6 ×2, deepseek-v4.1-flash, glm-5.3/-flash/-5.2,
  kimi-k3, qwen3.7-plus/-max, qwen3.8-max, qwen3-coder-plus, MiniMax-M3…), а
  New несёт реальное окно 1 024 000 / 1 048 576 / 262 144.

Вывод: legacy `MaxModelLen` — часто непрослеженная заглушка; `MaxModelLenNew` —
обновлённое поле, его и следует читать (0/null = не обновлено, тогда legacy).
Зафиксировано в `square.ts:parseSquareModel`.

## 3. Живые пробы на шлюзе (KEY2, `mimo-v2.6-flash`, /chat/completions)

Метод: калибровка chars→tokens малым запросом (200 единиц филлера →
`prompt_tokens=2049`, ≈10.245 токена/единицу), затем растущие промпты с
`max_completion_tokens` 16–32 и маркерами `ZZQX42MIDDLE` (середина) и
`ZZQX42END` (конец), которые модель должна вернуть — доказательство, что
промпт обработан целиком, а не обрезан.

| Цель по входным токенам | http | usage.prompt_tokens | finish | маркеры | время |
| --- | --- | --- | --- | --- | --- |
| ~300 000 | 200 | **292 879** | stop | оба возвращены | ~2 мин |
| ~700 000 | 200 | **683 309** | stop | оба возвращены | 318 s |
| ~1 024 000 | 200 | — (стрим открыт, но usage не получен за 905 s; проба остановлена, чтобы не жечь бюджет) | — | — | 905 s |

Промежуточный итог уже перекрывает старое значение каталога в 5+ раз:
**≥ 683 309** входных токенов приняты и обработаны целиком, `tokens_too_long`
не получен. Запрос ~1.02M прошёл admission (HTTP 200, тело принято, префилл
начался) — шлюз не отверг его как overflow, но полный round-trip не
доказывался: проба остановлена, чтобы не жечь бюджет (префилл такого размера —
минуты и ощутимые деньги). Значение окна в каталоге ставится по upstream-докам
(1 024 000), а фактический статус пробы — «≥683K proven, ~1.02M admitted».

Историческая справка: ещё 2026-09-24 проб принял 240 768 токенов
(research/live-probes-2026-09-24.md, §4) — т.е. «131072» никогда не было
жёстким капом.

Транспортный урок: префилл ~700K токенов занял >5 минут, а нестриминговый
запрос умер по `HeadersTimeoutError` (дефолт undici 300 s), тело ~4 MB — по
EPIPE. Большие пробы нужно гонять стримом (SSE-заголовки приходят сразу) и/или
`node:https` с `timeout: 0`.

## 4. Изменения в плагине

- `catalog.ts`: `mimo-v2.6-flash` / `-pro` → `contextWindow: 1_024_000`
  (const `CTX_1000K`), `maxTokens: 131_072` без изменений.
- `models.ts:guessWindows`: семейство `mimo*` (включая будущие id из оверлея,
  например `mimo-v2.6-pro-ultraspeed`, `mimo-v3.x`) → 1 024 000 / 131 072.
- `square.ts:parseSquareModel`: читает `MaxModelLenNew` (×1024) с приоритетом
  над legacy `MaxModelLen` — оверлей для неизвестных id больше не получит
  заниженное окно из устаревшего поля.

Прочие курируемые записи (kimi-k3, qwen3.8-max, glm-5.3, deepseek-v4.1-flash)
**намеренно не тронуты**: их `MaxModelLenNew` тоже намекает на 1M, но ни
upstream-документации, ни живых проб на этот счёт нет — задача была про
mimo v2.6. Кандидаты на следующую верификацию.
