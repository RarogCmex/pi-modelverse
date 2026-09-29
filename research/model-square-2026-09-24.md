# Сырые свидетельства: официальный каталог моделей (model square)

Дата захвата: 2026-09-24. Источник — **публичный** API (без авторизации), который
использует страница «模型广场» на https://astraflow.ucloud.cn/modelverse/playground.
Найден перехватом сетевых запросов этой страницы в браузере; воспроизводится
одним `curl` ниже — браузер для повторной проверки не нужен.

```bash
curl 'https://api.ucloud.cn/?Action=ListUFSquareModelGuest&Limit=300&Offset=0'
```

`TotalCount` на дату захвата: 125; получено записей: 124.

## Расшифровка полей

| Поле | Значение | Проверка |
| --- | --- | --- |
| `MaxModelLen` | Размер контекста в токенах | распределение 1048576 / 402800 / 262144 / 204800 / 131072 / 32768 |
| `MaxOutputTokens` | Лимит выхода в **единицах ×1024** | сверено с живой бисекцией: 128→131072 (mimo) ✓, 384→393216 (deepseek) ✓ |
| `MaxInputTokens` | Дополнительный лимит входа, иначе 0 | qwen3.8-max=991 — единственное ненулевое среди text-моделей |
| `ApiProtocols` | Матрица протоколов | ⚠️ НЕ совпадает с живой работой, см. ниже |
| `ModelCategory` | Text / Multimodal / Image / Video / Audio / Vector / Functional API | — |

## ⚠️ `ApiProtocols` не является истиной

Живые пробы расходятся с матрицей каталога:

| Модель | Square `ApiProtocols` | Живая проба |
| --- | --- | --- |
| `mimo-v2.6-flash` | ChatCompletions/Anthropic (**без Responses**) | `/responses` работает (function_call + reasoning, до 240K входа) |
| `glm-5.3` | ChatCompletions/**Responses**/Anthropic | `/responses` → 200 с пустым `output: []` → только chat |
| `qwen3.8-max` | **ChatCompletions** (без Responses) | `/responses` работает (`reasoning` + `function_call`) |

Вывод: **каталог используется только для чисел (окна/капы), маршрут всегда берётся из
живой пробы.** Это зафиксировано в `square.ts` и `catalog.ts`.

## Полная таблица (все 124 записей)

| id | category | MaxModelLen | MaxOutputTokens×1024 | MaxInputTokens | protocols |
| --- | --- | --- | --- | --- | --- |
| `speech-2.6-hd` | Audio | 1048576 | - | - | - |
| `speech-2.6-turbo` | Audio | 1048576 | - | - | - |
| `speech-2.8-hd` | Audio | 1048576 | - | - | - |
| `speech-2.8-turbo` | Audio | 1048576 | - | - | - |
| `IndexTeam/IndexTTS-2` | Audio | 131072 | - | - | ChatCompletions/Responses |
| `cicada-customised-audio` | Audio | 131072 | - | - | - |
| `cicada-tts` | Audio | 131072 | - | - | - |
| `qwen-audio-3.0-realtime-flash` | Audio | 131072 | - | - | - |
| `qwen-audio-3.0-realtime-plus` | Audio | 131072 | - | - | - |
| `qwen3-tts-flash` | Audio | 131072 | - | - | - |
| `doubao-web-search-custom` | Functional API | - | - | - | - |
| `doubao-seedream-4.5` | Image | 1048576 | - | - | - |
| `doubao-seedream-5-0-260128` | Image | 1048576 | - | - | - |
| `wan2.7-image` | Image | 1048576 | - | - | - |
| `wan2.7-image-pro` | Image | 1048576 | - | - | - |
| `Qwen/Qwen-Image` | Image | 131072 | - | - | - |
| `Qwen/Qwen-Image-Edit` | Image | 131072 | - | - | - |
| `doubao-seedream-5-0-pro-260628` | Image | 131072 | - | - | - |
| `qwen-image-3.0` | Image | 131072 | - | - | - |
| `qwen-image-3.0-pro` | Image | 131072 | - | - | - |
| `mimo-v2.5` | Multimodal | 1024000 | 134144 | - | ChatCompletions/Anthropic |
| `doubao-seed-2-0-lite-260215` | Multimodal | 262144 | 131072 | - | ChatCompletions/Responses |
| `doubao-seed-2-0-mini-260215` | Multimodal | 262144 | 131072 | - | ChatCompletions/Responses |
| `mimo-v2.5-pro` | Text | 1024000 | 131072 | - | ChatCompletions/Anthropic |
| `qwen3-max-preview` | Text | 1024000 | - | 256 | ChatCompletions/Responses/Anthropic |
| `qwen3.5-plus` | Text | 1024000 | 65536 | 991 | ChatCompletions/Responses/Anthropic |
| `qwen3.6-plus` | Text | 1024000 | 65536 | 991 | ChatCompletions/Responses/Anthropic |
| `zai-org/glm-4.6` | Text | 402800 | - | - | ChatCompletions/Anthropic |
| `Qwen/Qwen3-Coder` | Text | 262144 | - | - | ChatCompletions/Anthropic |
| `Qwen/Qwen3-Max` | Text | 262144 | - | 256 | ChatCompletions/Responses/Anthropic |
| `doubao-seed-2-0-code-preview-260215` | Text | 262144 | 131072 | - | ChatCompletions/Responses |
| `doubao-seed-2-0-pro-260215` | Text | 262144 | 131072 | - | ChatCompletions/Responses |
| `kimi-k2.6` | Text | 262144 | - | - | ChatCompletions/Anthropic |
| `qwen3-vl-flash` | Text | 262144 | - | - | ChatCompletions/Anthropic |
| `MiniMax-M2` | Text | 204800 | - | - | ChatCompletions/Responses/Anthropic |
| `MiniMax-M2.1` | Text | 204800 | - | - | ChatCompletions/Responses/Anthropic |
| `MiniMax-M2.1-lightning` | Text | 204800 | - | - | ChatCompletions/Responses/Anthropic |
| `MiniMax-M2.5` | Text | 204800 | 131072 | 192 | ChatCompletions/Responses/Anthropic |
| `MiniMax-M2.5-lightning` | Text | 204800 | - | - | ChatCompletions/Responses/Anthropic |
| `MiniMax-M2.7` | Text | 204800 | 131072 | - | ChatCompletions/Responses/Anthropic |
| `MiniMax-M2.7-highspeed` | Text | 204800 | 131072 | - | ChatCompletions/Responses/Anthropic |
| `glm-5-turbo` | Text | 204800 | 131072 | - | ChatCompletions/Anthropic |
| `glm-5.1` | Text | 204800 | 131072 | - | ChatCompletions/Anthropic |
| `zai-org/glm-4.6v` | Text | 204800 | 32768 | 96 | ChatCompletions/Anthropic |
| `zai-org/glm-4.7` | Text | 204800 | 131072 | 72 | ChatCompletions/Anthropic |
| `zai-org/glm-5` | Text | 204800 | 131072 | - | ChatCompletions/Responses/Anthropic |
| `LingDT-3.0-flash` | Text | 131072 | 32768 | - | ChatCompletions/Anthropic |
| `MiniMax-M3` | Text | 131072 | - | - | ChatCompletions/Responses/Anthropic |
| `Qwen/Qwen3-VL-235B-A22B-Instruct` | Text | 131072 | - | - | ChatCompletions/Anthropic |
| `baidu/ernie-4.5-turbo-128k` | Text | 131072 | 4096 | 124 | ChatCompletions/Anthropic |
| `deepseek-v4-flash-0731` | Text | 131072 | 393216 | - | ChatCompletions/Responses/Anthropic |
| `deepseek-v4-flash-vision-exp` | Text | 131072 | 393216 | 384 | ChatCompletions/Responses/Anthropic |
| `deepseek-v4-pro-0813` | Text | 131072 | 393216 | - | ChatCompletions/Responses/Anthropic |
| `deepseek-v4.1-flash` | Text | 131072 | 393216 | - | ChatCompletions/Responses/Anthropic |
| `doubao-seed-2-1-pro-260628` | Text | 131072 | 262144 | 256 | ChatCompletions/Responses |
| `doubao-seed-2-1-turbo-260628` | Text | 131072 | 262144 | 256 | ChatCompletions/Responses |
| `doubao-seed-evolving` | Text | 131072 | 262144 | 1024 | ChatCompletions/Responses |
| `easydoc-emr-mask` | Text | 131072 | - | - | - |
| `easydoc-extract` | Text | 131072 | - | - | - |
| `easydoc-fin-chat` | Text | 131072 | - | - | ChatCompletions |
| `easydoc-parse-premium` | Text | 131072 | - | - | - |
| `glm-5.2` | Text | 131072 | 131072 | - | ChatCompletions/Anthropic |
| `glm-5.3` | Text | 131072 | 131072 | - | ChatCompletions/Responses/Anthropic |
| `glm-5.3-flash` | Text | 131072 | 131072 | - | ChatCompletions/Responses/Anthropic |
| `kimi-k2.7-code` | Text | 131072 | 32768 | - | ChatCompletions |
| `kimi-k2.7-code-highspeed` | Text | 131072 | 32768 | - | ChatCompletions |
| `kimi-k3` | Text | 131072 | 1024000 | - | ChatCompletions |
| `mimo-v2.6-flash` | Text | 131072 | 131072 | - | ChatCompletions/Anthropic |
| `mimo-v2.6-pro` | Text | 131072 | 131072 | - | ChatCompletions/Anthropic |
| `minimax-h3-context-ir` | Text | 131072 | - | - | - |
| `qwen-mt-flash` | Text | 131072 | 8192 | 8 | ChatCompletions/Anthropic |
| `qwen3-30b-a3b` | Text | 131072 | - | - | ChatCompletions |
| `qwen3-coder-30b-a3b-instruct` | Text | 131072 | - | 256 | ChatCompletions/Responses/Anthropic |
| `qwen3-coder-plus` | Text | 131072 | - | 1000 | ChatCompletions/Responses/Anthropic |
| `qwen3.6-35b-a3b` | Text | 131072 | 65536 | 254 | ChatCompletions/Responses/Anthropic |
| `qwen3.7-max` | Text | 131072 | 65536 | 991 | ChatCompletions/Responses/Anthropic |
| `qwen3.7-plus` | Text | 131072 | 65536 | 991 | ChatCompletions/Responses/Anthropic |
| `qwen3.8-max` | Text | 131072 | 134144 | 991 | ChatCompletions |
| `doubao-seed-1-6-lite-251015` | Text | 131071 | - | - | ChatCompletions/Anthropic |
| `Qwen/Qwen3-30B-A3B-Thinking` | Text | 32768 | 32768 | 124 | ChatCompletions/Anthropic |
| `baidu/ernie-4.5-turbo-vl-32k` | Text | 32768 | 30720 | 32 | ChatCompletions/Anthropic |
| `bge-reranker-v2-m3` | Vector | 1048576 | - | - | - |
| `BAAI/bge-large-zh-v1.5` | Vector | 131072 | - | - | - |
| `BAAI/bge-m3` | Vector | 131072 | - | - | - |
| `qwen3-embedding-8b` | Vector | 32768 | - | - | - |
| `qwen3-reranker-8b` | Vector | 32768 | - | - | - |
| `MiniMax-Hailuo-2.3` | Video | 1048576 | - | - | - |
| `MiniMax-Hailuo-2.3-Fast` | Video | 1048576 | - | - | - |
| `Wan-AI/Wan2.5-I2V` | Video | 1048576 | - | - | - |
| `Wan-AI/Wan2.5-T2V` | Video | 1048576 | - | - | - |
| `Wan-AI/Wan2.6-I2V` | Video | 1048576 | - | - | - |
| `Wan-AI/Wan2.6-T2V` | Video | 1048576 | - | - | - |
| `happyhorse-1.0-i2v` | Video | 1048576 | - | - | - |
| `kling-v2-6` | Video | 1048576 | - | - | - |
| `kling-v3` | Video | 1048576 | - | - | - |
| `kling-v3-omni` | Video | 1048576 | - | - | - |
| `kling-video-o1` | Video | 1048576 | - | - | - |
| `vidu-lip-sync` | Video | 1048576 | - | - | - |
| `vidu-mv` | Video | 1048576 | - | - | - |
| `viduq2` | Video | 1048576 | - | - | - |
| `viduq2-pro-fast` | Video | 1048576 | - | - | - |
| `viduq2-pro-fast-abroad` | Video | 1048576 | - | - | - |
| `viduq3-turbo` | Video | 1048576 | - | - | - |
| `MiniMax-H3` | Video | 131072 | - | - | - |
| `MiniMax-H3-Max` | Video | 131072 | - | - | - |
| `cicada-video-lip-sync` | Video | 131072 | - | - | - |
| `happyhorse-1.0-r2v` | Video | 131072 | - | - | - |
| `happyhorse-1.0-t2v` | Video | 131072 | - | - | - |
| `happyhorse-1.0-video-edit` | Video | 131072 | - | - | - |
| `happyhorse-1.1-i2v` | Video | 131072 | - | - | - |
| `happyhorse-1.1-r2v` | Video | 131072 | - | - | - |
| `happyhorse-1.1-t2v` | Video | 131072 | - | - | - |
| `minimax-h3-lite` | Video | 131072 | - | - | - |
| `viduq2-pro` | Video | 131072 | - | - | - |
| `viduq2-turbo` | Video | 131072 | - | - | - |
| `viduq3-pro` | Video | 131072 | - | - | - |
| `wan2.6-r2v` | Video | 131072 | - | - | - |
| `wan2.6-r2v-flash` | Video | 131072 | - | - | - |
| `wan2.7-i2v` | Video | 131072 | - | - | - |
| `wan2.7-r2v` | Video | 131072 | - | - | - |
| `wan2.7-t2v` | Video | 131072 | - | - | - |
| `wan2.7-videoedit` | Video | 131072 | - | - | - |
| `wan3.0-video` | Video | 131072 | - | - | - |
| `wan3.0-video-prime` | Video | 131072 | - | - | - |

## Покрытие

Guest-каталог содержит ~125 **открытых** моделей. Проксируемый фронтир
(`claude-*`, `gpt-*`, `gemini-*`) в нём **отсутствует** — эти id обслуживаются
курируемой таблицей и живыми пробами, а их окна/капы в guest-API не публикуются.
`auto` (Auto Router) тоже отсутствует — это роутер, а не запись каталога.
