# obrashchenie-kit: как выпустить

Раздел для общего `RELEASE.md`. Команды `gh` выполняет владелец организации после решения о публикации. Всё ниже бесплатно на плане Free для публичного репо

obrashchenie-kit потребитель: нормы, сроки и календарь он берёт снимком из pal-norms, регионы и ведомства из pal-directory. Поэтому он пушится **после pal-norms и pal-directory**, когда у обоих зелёный `pages` и живые наборы данных

## 1. До первого пуша

1. Pages через Actions, иначе первый `pages.yml` упадёт на деплое:

   ```sh
   gh api -X POST repos/openpalliative/obrashchenie-kit/pages -f build_type=workflow
   ```

   Если Pages уже включены из ветки: `gh api -X PUT repos/openpalliative/obrashchenie-kit/pages -f build_type=workflow`

2. Права Actions: по умолчанию только чтение и разрешение ботам открывать PR. Без этого `create-pull-request` в `sync-data.yml` падает с ошибкой прав. То же разрешение нужно на уровне организации

   ```sh
   gh api -X PUT orgs/openpalliative/actions/permissions/workflow -f default_workflow_permissions=read -F can_approve_pull_request_reviews=true
   gh api -X PUT repos/openpalliative/obrashchenie-kit/actions/permissions/workflow -f default_workflow_permissions=read -F can_approve_pull_request_reviews=true
   ```

3. Метки. `sync-data.yml` ставит на PR `facts` или `review:legal`, issues о заблокированном пакете и о сроках проверки идут с `review:legal`, форма «Ошибка в документе» тоже ставит `review:legal`. `review:data` нужна для правок снимков руками. Все метки во всех репо ставит `scripts/labels` из хаба, только для этого репо:

   ```sh
   gh label create review:legal --color B60205 --description "Нужна проверка юристом" --repo openpalliative/obrashchenie-kit --force
   gh label create review:data --color FBCA04 --description "Данные изменились, нужна сверка человеком перед слиянием" --repo openpalliative/obrashchenie-kit --force
   gh label create facts --color 0E8A16 --description "Служебные снимки и даты проверки, семьи их не видят" --repo openpalliative/obrashchenie-kit --force
   ```

4. Закрытые отчёты об уязвимостях (на них ссылаются `SECURITY.md`, `CODE_OF_CONDUCT.md` и `config.yml` форм issue):

   ```sh
   gh api -X PUT repos/openpalliative/obrashchenie-kit/private-vulnerability-reporting
   ```

   Secret scanning, push protection и Dependabot alerts включаются в Settings > Code security

5. Свежие настоящие снимки соседей. Сборка для публикации идёт с `OK_VENDOR=real` и отказывается собираться на тестовом снимке из `tests/fixtures/vendor/`. Локально, когда pal-norms и pal-directory уже собраны в соседних папках:

   ```sh
   sh scripts/sync-data --from local
   OK_VENDOR=real uv run python -m opsite build
   OK_VENDOR=real uv run python -m opsite check
   sh scripts/gate.sh
   ```

   В `deps.yaml` должны стоять версии и `content_sha256` настоящих снимков, без `fixture-` в версии. Если соседи уже на Pages, вместо `--from local` можно `--from pages`, результат тот же

6. Дата первой публикации пакета. В `data/pack/pack.yaml` поставить `first_public_at` датой пуша, в виде `"2026-10-20"`, и закоммитить вместе с первым пушем. От этой даты считается правило трёх месяцев: если за 90 дней пакет так и не проверил юрист (список `reviewers` пуст), ежемесячный `review_due` откроет issue «Архивировать kit?». Пустая дата значит, что правило не работает

## 2. Порядок пуша

1. pal-norms, дождаться зелёного `pages` и https://openpalliative.github.io/pal-norms/data/v1/index.json
2. pal-directory, дождаться зелёного `pages` и https://openpalliative.github.io/pal-directory/data/v1/index.json
3. obrashchenie-kit (этот репо). В нём уже лежат снимки из шага 1.5, первый деплой от живых соседей не зависит
4. Сразу после пуша ручной `sync-data`, чтобы проверить, что снимки с Pages читаются:

   ```sh
   gh workflow run sync-data.yml --repo openpalliative/obrashchenie-kit
   ```

   Если соседи на Pages совпадают с локальными снимками, PR не появится, это нормально. В логе шага `report` видно, что изменилось и какие метки получил бы PR

## 3. Первые прогоны

| Workflow | Когда | Что проверить |
|---|---|---|
| `checks` | сам на push в main и на каждый PR, вручную `gh workflow run checks.yml` | зелёный: actionlint, pytest, `pack_lint`, сборка, `opsite check --ci`, unit, e2e, скриншоты |
| `pages` | сам на push в main, вручную `gh workflow run pages.yml` | зелёный, в шаге deploy адрес https://openpalliative.github.io/obrashchenie-kit/ |
| `sync-data` | по вторникам в 05:43 UTC, вручную `gh workflow run sync-data.yml` | зелёный job `sync`; job `review-due` при ручном запуске сразу открывает issues по просроченным проверкам, это ожидаемо для демо-пакета |

Как живёт `sync-data.yml`:

- новые снимки приходят PR из ветки `sync/<дата>` с меткой `facts` (поменялись только календарь или номера, сборка зелёная) или `review:legal` (всё остальное). События от `GITHUB_TOKEN` не запускают другие workflows, поэтому `sync-data.yml` сам запускает `checks.yml` на ветке PR через `gh workflow run`
- если после обновления норма в пакете отменена или пропала, сборка в PR красная, а рядом issue «Пакет заблокирован» с меткой `review:legal`
- слияние PR человеком это обычный push в main, после него `pages.yml` пересобирает сайт сам. Отдельный запуск pages не нужен
- `data/snapshots/upstream.json` (версии и `content_sha256` снимков соседей на дату сверки) обновляется в том же PR, только когда снимки поменялись. Сайт этот файл не читает
- в main бот напрямую не пишет, поэтому защита main ему не мешает
- последний шаг (с `if: always()`) включает `sync-data.yml` обратно через `PUT .../actions/workflows/sync-data.yml/enable`: GitHub выключает расписание в публичных репо после 60 дней без активности. Раз в месяц всё равно стоит открыть вкладку Actions и проверить, что `sync-data` не выключен

## 4. Защита main

Ruleset на main: запрет force push и удаления, изменения только через PR, обязательная проверка `gate` из `checks.yml`. Обязательного ревью CODEOWNERS не ставить, пока мейнтейнер один. Когда появится юрист в РФ, добавить его в `.github/CODEOWNERS` к строкам `data/pack/` и включить обязательное ревью владельцев

## 5. Живой сайт

После зелёного `pages`:

```sh
curl -s -o /dev/null -w '%{http_code}\n' https://openpalliative.github.io/obrashchenie-kit/
curl -s -o /dev/null -w '%{http_code}\n' https://openpalliative.github.io/obrashchenie-kit/nope/
curl -s https://openpalliative.github.io/obrashchenie-kit/nope/ | grep -c 'Такой страницы нет'
curl -s -o /dev/null -w '%{http_code}\n' https://openpalliative.github.io/obrashchenie-kit/sw.js
curl -s https://openpalliative.github.io/obrashchenie-kit/sitemap.xml | head -3
```

- `/obrashchenie-kit/` отдаёт 200, в подвале версия данных и дата
- `/obrashchenie-kit/nope/` отдаёт 404 и страницу `404.html` этого репо («Такой страницы нет» и ссылка «К началу раздела «Заявления и жалобы»»), а не общую 404 GitHub
- `sw.js` отдаёт 200. В браузере на `/obrashchenie-kit/` в инструментах разработчика, вкладка Application > Service workers, должен быть активный worker со scope `https://openpalliative.github.io/obrashchenie-kit/`. После этого страницы открываются без интернета
- на странице `/obrashchenie-kit/data/` версии снимков pal-norms и pal-directory совпадают с `deps.yaml`, пометки «Снимок устарел» нет
- headless-проверка: ни одного запроса за пределы `openpalliative.github.io`

## 6. Релиз

```sh
git tag -a v2026.10.20 -m "obrashchenie-kit 2026.10.20"
git push origin v2026.10.20
```

`release.yml` прогоняет pytest, `pack_lint`, сборку с настоящими снимками и проверки сайта, потом публикует релиз:

- `obrashchenie-kit-<тег>-site.zip`: готовый сайт `_site`, рассчитан на адрес `/obrashchenie-kit/`
- `obrashchenie-kit-<тег>-data.zip`: опубликованные наборы `data/v1` со схемами
- `SHA256SUMS`: проверка `sha256sum -c SHA256SUMS`

## 7. Карточка репо

- Description: `Заявления и жалобы для семей: попросить ответ на бумаге, посчитать срок ответа и выбрать следующий шаг`
- Website: https://openpalliative.github.io/obrashchenie-kit/
- Topics: `palliative-care`, `russia`, `legal-templates`, `deadlines`, `github-pages`, `offline-first`
- Social preview: загрузить `docs/social-preview.png` (1280 на 640) в Settings > General вручную, API для этого нет

## 8. Проверено локально

- actionlint 1.7.12 с shellcheck 0.10.0: 0 замечаний по 4 workflow (`sh scripts/gate.sh`, шаг actionlint)
- `uvx zizmor --offline`: находок medium и выше нет. В режиме auditor остаются только низкие: нет комментариев к правам и имён у шагов
- пины экшенов сверены `git ls-remote` 11.10.2026:

| Экшен | Версия | SHA |
|---|---|---|
| actions/checkout | v7.0.1 | `3d3c42e5aac5ba805825da76410c181273ba90b1` |
| astral-sh/setup-uv | v10.3.0 | `1c37ad07a6a961277cf70c0d37d6f313000f5884` |
| pnpm/action-setup | v6.1.0 | `ea17c68df8912ef543352723c149a84f56e3d413` |
| actions/setup-node | v7.1.0 | `949feb2413d6458794dcd2491c4babbbce0c15c1` |
| actions/upload-artifact | v7.0.2 | `cf430e030ddbb5b0abf93d22962f4752f3646cd9` |
| actions/upload-pages-artifact | v5.0.0 | `fc324d3547104276b827a68afc52ff2a11cc49c9` |
| actions/deploy-pages | v5.0.1 | `368f82528645a54fb793d4d04e342629a3f51346` |
| peter-evans/create-pull-request | v8.1.1 | `5f6978faf089d4d20b00c7766989d076bb2fc7f1` |

Не проверено: живые прогоны на GitHub (репо ещё не опубликован), работа `create-pull-request` при защите main, ответ Pages соседей раннеру
