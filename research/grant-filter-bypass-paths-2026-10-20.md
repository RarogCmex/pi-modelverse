# Фильтр грантов обходился мимо `filterModels` — 2026-10-20

Повод: жалоба «доступ к `modelverse/gpt-6-luna` должен фильтроваться текущим
ключом (он даёт ошибку), но он не фильтруется». Ключ в `auth.json` — промо
(отпечаток `5d9f6ba6cac48be25d50f45ec4540a05`), его живой листинг на день
проверки — **8 id**, `gpt-6-luna` среди них нет:

```
$ node -e '… GET /v1/models с ключом из auth.json …'
status 200 ids: 8
[ 'ai-mediakit-video-enhancement-std', 'mimo-v2.6-flash', 'mimo-v2.6-pro',
  'jev-1.13.0', 'gemini-3.8-flash', 'gemini-3.7-flash', 'gpt-5.6-luna',
  'gpt-5.6-terra' ]
gpt-6-luna granted: false
```

Окружение: pi 1.3.0 / pi-ai 1.3.0, Node v26.10.0, macOS. Ключи в файл не
копируются. Все проверки — на реальном `~/.pi/agent` (копия в отдельном
`HOME`, чтобы не трогать боевое состояние) через SDK: `createAgentSession()`
→ `session.modelRuntime`.

## 1. Симптом в боевой сессии

`~/.pi/agent/sessions/--Users-rarogcmex-pi-plugins-pi-reformboss-internal--/2026-10-20T07-04-14-148Z_01a1581f-fe42-7796-881d-1a3ac7035862.jsonl`:

```
строка 188  model_change  2026-10-20T10:21:07.378Z  modelverse  gpt-6-luna
ошибок modelverse/gpt-6-luna (stopReason=error): 99
  первая 2026-10-20T10:21:26.985Z, последняя 2026-10-20T11:29:55.910Z
  текст: «modelverse: ключ [uminferapikey-…] не имеет доступа к модели
          [gpt-6-luna]. …»  (наша же переписанная ошибка гранта)
```

То есть модель удалось **выбрать**, и дальше каждый запрос (с ретраями
`pi-retry`, `maxRetries: 10`) упирался в отказ шлюза — 99 раз за час.

## 2. Здоровый путь работал

`filterModels` отрабатывал корректно: на том же ключе и том же
`modelverse-grants.json` провайдер выдавал 6 курируемых id из 14,
`gpt-6-luna` в списке не было.

```
snapshot total: 179   modelverse: 7        # 6 курируемых + 1 оверлей
[ ai-mediakit-video-enhancement-std, gemini-3.7-flash, gemini-3.8-flash,
  gpt-5.6-luna, gpt-5.6-terra, mimo-v2.6-flash, mimo-v2.6-pro ]
gpt-6-luna available: false
await getAvailable('modelverse'): 7        # тот же набор
```

## 3. Обход №1 — реестр отдаёт невыданный id (детерминированно)

pi-ai документирует контракт явно (`pi-ai/dist/models.d.ts:104-109`):

```
/**
 * Optional provider policy for credential-specific model availability.
 * `getModels()` remains the complete synchronous chat catalog; `Models.getAvailable()`
 * applies this filter after confirming that provider auth is configured.
 */
filterModels?(models, credential): readonly Model<TApi>[];
```

`filterModels` вызывается ровно в одном месте — `Models.getAvailable()`
(`pi-ai/dist/models.js:311`). Всё остальное читает синхронный каталог
провайдера, причём `getModel(provider, id)` — это
`getModels(provider).find(…)` (`pi-ai/dist/models.js:116-118`):

| путь pi | источник списка | ссылка |
| --- | --- | --- |
| `--model provider/id` | `modelRuntime.getModels()` — **все** модели, «чтобы `--api-key` работал при первой настройке» | `core/model-resolver.js:315` |
| дефолт из settings | `modelRuntime.getModel(defaultProvider, defaultModelId)` | `core/model-resolver.js:399` |
| восстановление сессии (`pi -c`, `--resume`) | `modelRuntime.getModel(savedProvider, savedModelId)` | `core/model-resolver.js:433` |
| селектор: обновление уже выбранных scoped-моделей | `modelRuntime.getModel(…)` | `interactive/components/model-selector.js:111` |

До изменения:

```
ALL modelverse models in registry: [ 15 id, gpt-6-luna в их числе ]
getModel(modelverse, gpt-6-luna): true
```

и CLI реально уходил в запрос (проверка с заведомо мёртвым
`MODELVERSE_BASE_URL=http://127.0.0.1:9/v1`, чтобы не платить за круг):

```
$ HOME=/tmp/pi-cli MODELVERSE_BASE_URL=http://127.0.0.1:9/v1 \
    pi --no-session --print --model modelverse/gpt-6-luna "say hi"
Connection error.          # модель выбрана и стримится, никакого отказа
```

После изменения тот же запуск:

```
Warning: Model "gpt-6-luna" not found for provider "modelverse". Using custom model id.
Connection error.
```

— pi честно не нашёл id в каталоге провайдера. Дальше он всё равно подставляет
«custom model id»: это поведение pi для BYO-шлюзов, плагин его снять не может
(и не должен — на шлюзе может появиться id, которого нет в нашем каталоге).
Разница в том, что предупреждение теперь соответствует действительности, а
восстановление сессии и дефолт из settings такой id больше не берут.

## 4. Обход №2 — деградировавший `snapshot.available`

Пикер и `/model <текст>` читают `modelRuntime.getAvailableSnapshot()`. Этот
снапшот наполняется двумя путями (`core/model-runtime.js`):

- `runAvailabilityRefresh()` (`:189-214`) — `Promise.all` по **всем**
  провайдерам: `models.getAvailable(undefined)` + `checkAuth` каждого +
  `credentials.list()`. Здесь `filterModels` применяется.
- `updateModelSnapshot()` (`:181-188`) —
  `available = all.filter(m => configuredProviders.has(m.provider))`,
  то есть **полный каталог** настроенных провайдеров без фильтра грантов.
  Так же действует `markProvisionallyConfigured()` (`:647`) при регистрации.

`updateModelSnapshot()` вызывается в `refresh()` (`:587`) **до**
`queueAvailabilityRefresh()`, а ошибка последнего проглатывается:

```js
catch {
    // Availability errors are recorded by the latest pass; refreshed models remain usable.
}
```

`runAvailabilityRefresh` — один `Promise.all` на все провайдеры, поэтому отказ
любого из них (чужой `apiKey.check`, чтение хранилища креденшелов) роняет весь
проход и оставляет в снапшоте **нефильтрованный** список — надолго, до
следующего удачного прохода. Проверка (в SDK-сессии подменён
`models.getAvailable` на отвергающий, чтобы не ждать случайного отказа чужого
плагина):

**до изменения**

```
healthy                     mv =  6 | gpt-6-luna listed: false
availability pass failed    mv = 14 | gpt-6-luna listed: true
getError(): Availability refresh: simulated: Credential store read failed for some-other-provider
recovered                   mv =  6 | gpt-6-luna listed: false
```

**после изменения**

```
healthy                     mv =  6 | registry getModel(gpt-6-luna): false | listed: false
availability pass failed    mv =  6 | registry getModel(gpt-6-luna): false | listed: false
recovered                   mv =  6 | registry getModel(gpt-6-luna): false | listed: false
```

Тот же механизм объясняет «плавающее» появление модели в пикере без всякой
подмены: `interactive-mode.js:833` и `:4547` запускают
`void refreshModelCatalogs(…)` фоном, селектор — тоже
(`model-selector.js:101`), и между `updateModelSnapshot()` и приземлением
прохода доступности список в снапшоте нефильтрованный. А `findExactModelMatch`
(`interactive-mode.js:4341-4372`) после безуспешного поиска по кэшу обновляет
каталоги и ищет **заново по снапшоту** — то есть `/model gpt-6-luna` совпадёт
именно в таком окне (какой из двух путей привёл к `model_change` в боевой
сессии, из файла не восстановить — обе читают один и тот же снапшот).

## 5. Решение

Гранты применяются к самому каталогу провайдера: `buildModelverseProvider`
возвращает обёртку, у которой `getModels()`/`getAllModels()` пропущены через
ту же `filterModelsByGrants`, а `filterModels` остаётся (здоровый путь pi и
документированный контракт). Ключ, по которому фильтровать, берётся из собственных
хуков pi — их же хватает, чтобы узнать его раньше любого рендера пикера:

| хук | когда | что даёт |
| --- | --- | --- |
| `refreshModels(context)` | офлайн-фаза сразу после регистрации (`void this.refresh({allowNetwork:false})`, `model-runtime.js:640`) | `context.credential` = сохранённый креденшел; **самый ранний** — `createProvider` из офлайн-фазы возвращается до вызова `fetchModels` (`pi-ai/dist/models.js:199`) |
| `filterModels(models, credential)` | каждый проход доступности | эффективный ключ (stored → env) |
| `/login` | ввод нового ключа | каталог перестраивается в том же тике, не дожидаясь прохода доступности |

Оптимистичное правило прежнее: нет ключа или ключ ни разу не наблюдался —
каталог не прячется. Отступать от «`getModels()` остаётся полным каталогом»
здесь безопасно именно потому, что на этом шлюзе невыданный id — не модель, а
гарантированный `400 No permission`.

Живая проверка обоими ключами (`node live/check.ts --no-smoke`, новый блок
«catalog view»):

```
catalog view (KEY1): cold=14 after refresh=138 granted=273
  gpt-6-luna resolvable by id: true
  claude-opus-5-5 resolvable by id: true

catalog view (KEY2): cold=14 after refresh=7 granted=8
  gpt-6-luna resolvable by id: false
  claude-opus-5-5 resolvable by id: false
```

широкий ключ не потерял ничего (14 курируемых + 124 оверлея), промо-ключ не
видит чужих id ни в пикере, ни в резолвинге по id. `cold=14` — до того, как pi
сообщил ключ, каталог полный (оптимистичный пропуск).

## 6. Что осталось за пределами этой правки

- **`--model <несуществующий-id>` всё равно уходит в запрос**: pi подставляет
  custom model id после предупреждения (см. §3). Закрыть это можно только
  отказом на стриме; плагин сознательно этого не делает — шлюз остаётся
  инстанцией правды по грантам, а его отказ уже переписан в понятный
  (`errors.ts`, `clarifyGrantError`).
- **Устаревший листинг**: если ключу выдали модель после последнего удачного
  `GET /v1/models`, она не появится до следующего обновления каталога. Это
  прежнее поведение фильтра, цена синхронности `filterModels`.
- **Побочная находка (не исправлена)**: неудачный листинг возвращает из
  `fetchModelverseModels` `[]`, а `createProvider` публикует и **персистит**
  этот пустой результат (`pi-ai/dist/models.js:592-596`) — сохранённый оверлей
  в `models-store.json` затирается, хотя комментарий в `discovery.ts` обещает
  «a failed listing must not unregister models». На гранты не влияет (набор
  грантов пишется только при успехе), лечится возвратом `context.stored.models`
  при неудаче. Наблюдено на копии `models-store.json` во время этих проб:
  `['ai-mediakit-video-enhancement-std']` → `[]` при одном неудачном
  (параллельные refresh, 8-секундный таймаут) листинге.
