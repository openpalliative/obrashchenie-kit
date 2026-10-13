# obrashchenie-kit: архитектура

Срез 11.10.2026. Инструмент «Заявления и жалобы» (идеи 2, 1 и 8 из плана проекта, карточки 1, 2, 8). Работает поверх `../PLATFORM.md` и `../UX_MAP.md`. По технике прав PLATFORM, по адресам, текстам и состояниям права UX_MAP. Отступления от них перечислены в разделе 8 и попадают в `../STATUS.md`.

Основа: архитектура варианта «от данных» (`data/pack/` как данные, чистые модули в `lib/`, fail closed при сборке и в браузере). Из варианта «от людей» взяты анкета по одному вопросу на экран, печать в 2 экземплярах с блоком отметки о приёме, нейтральный `document.title` и `navigator.storage.persist()`. Поверх этого правки критики: пункты 1, 2, 5, 8 целиком, остальные частично (раздел 0).

## 0. Решения в одном списке

| # | Решение | Почему |
|---|---|---|
| K1 | Kit сам ничего не парсит и в сеть не ходит ни при сборке, ни в рантайме. Нормы, сроки, календарь берёт из снимка `pal-norms`, регионы и ведомства из снимка `pal-directory`. Свои данные: пакет T0, сценарии, граф шагов, типы ответа, каналы, федеральные адресаты, вехи 18 лет | если сменится формат источника, сломается парсер соседа, а kit живёт на последнем хорошем снимке |
| K2 | Крупно на экране дела только факт: дата, до которой должен прийти ответ, формула и статус проверки. Одна главная кнопка бывает только у шага, который следует из даты (срок прошёл: «Собрать жалобу на нарушение срока»). Всё, что зависит от содержания ответа, показано 2-3 равноправными вариантами с подписью «Варианты. Решаете вы» | граница «процедура / консультация» (5n(1)(a), правило проекта: «варианты», «документ составляете вы») |
| K3 | Экран «Что пришло в ответ»: 4 крупных варианта (ответа нет, отказали, переслали, другое или не знаю), под «Уточнить» ещё 8 типов. «Не знаю» показывает варианты, первым «Попросить ответ по существу», но без пометки «рекомендуем» | UX_MAP 2.2 (6-8 типов) и критика п. 1 |
| K4 | 59-ФЗ (сроки 3, 7 и 30 дней, ч. 6 ст. 8) в MVP идёт с `verified:false`. На странице дела дата показана со статусом «Не проверено». В документе сроков нет, только «прошу дать ответ в установленный срок», а ч. 6 ст. 8 заменена просьбой без номера статьи. Как только `pal-norms` переведёт 59-ФЗ в `verified:true`, пересборка сама включит ссылки на норму | текст закона взят с kremlin.ru (раздел 3.4), это не официальная публикация с eoNumber. Fail closed по PLATFORM 4.3 |
| K5 | Пакет T0 лежит в `data/pack/` (колонка «data/ (канон)» в PLATFORM 2.2), сценарии в `data/scenarios.yaml` | PLATFORM 2.2 |
| K6 | Подстановки норм `{{norm:id#p-N}}` разрешаются при сборке в `pipeline/export.py`: если норма не `in_force` или `verified:false`, в `documents.json` попадает `fallback`, а блок помечается `norm_state`. Браузер только подставляет поля человека и ещё раз отказывается печатать блок с `norm_state != "ok"` без fallback | одна логика, проверяемая pytest; браузер страхует |
| K7 | `pack_lint.py` в MVP пишет DATA этого репо (`pipeline/pack_lint.py`), сборка вызывает его. Модуль предлагается к переносу в `pal-norms/tools/` (строка в STATUS «В платформу»). Пока `vendor/pal-norms/tools/pack_lint.py` не проходит фикстуры kit, он не используется | схема пакета принадлежит kit, а `pal-norms` строится параллельно; один путь кода |
| K8 | Хранение через `openStore('obrashchenie-kit')` (key-value из `opsite/ui/js/store.js`): ключи `case:<id>`, `profile`, `seen:<flag>`. Дело хранится одним объектом со списком событий. До 3 дел на устройстве | платформенный store, без своих object store |
| K9 | Журнал правится напрямую: у события «Исправить» и «Удалить» (с подтверждением), у исправленного видно «изменено DD.MM.YYYY». Без append-only и событий `correction` | дело локальное, доказательной силы у журнала нет (критика п. 8) |
| K10 | ФИО, адрес, телефон заявителя и данные доверенности по умолчанию не сохраняются. Галочка «Запомнить мои данные на этом устройстве» включает ключ `profile`. Поля документа с `personal: true` хранятся в деле только при этой галочке, иначе живут до закрытия вкладки | критика п. 5 |
| K11 | `.ics`: события на весь день (`VALUE=DATE`), SUMMARY нейтральный («Срок по обращению», «Напоминание о сроке»), без имён, МО и диагнозов, `VALARM` за 1 день | календари уходят в облака |
| K12 | Печать документа: `.op-doc` без знака, цвета, латиницы и URL, внизу «Черновик» по-русски. Перед печатью `document.title` = «Заявление» или «Жалоба», после печати возвращается. Памятка «Как подать» печатается отдельной страницей с `.op-sheet-footer` | PLATFORM 3.2 и критика п. 4 |
| K13 | Даты, которые человек вводит сам (день рождения, дата отказа), три поля: день, месяц списком, год. Показ дат словами с днём недели: «до пятницы, 14 ноября 2026» | критика п. 9, пожилые на старых Android |
| K14 | Бюджет JS: `lib/` до 700 строк, `assets/js/` до 800, вместе до 1500 (`wc -l` без пустых). Превышение сначала режет функции, Preact не вендорим | PLATFORM 1, порог 1500 |
| K15 | Правило проекта «3 месяца демо без юриста ведут в архив» записано в README и проверяется ежемесячно (раздел 5). T1 в MVP нет, «мёртвая рука» для T1 существует только как правило `t1_expired` в линте с фикстурой | один человек, честный стоп-критерий |
| K16 | Номера и ведомства региона берутся только из снимка `pal-directory`. В режиме `demo` у соседа номера синтетические (`origin: synthetic`), kit не делает из них `tel:`. Почтовых адресов нет нигде, адрес адресата вписывает человек | данных нет, выдумывать нельзя |

## 1. Что строим

### 1.1 MVP (этот прогон)

- 5 страниц сценариев статикой, читаются и печатаются без JS: `oral-refusal`, `no-answer`, `vk-refused`, `discharge`, `forwarded`
- Анкета нового дела (4 вопроса по одному на экран) и экран дела: ближайший срок с формулой, этапы, лестница шагов списком `<ol>` с датами, журнал, «Добавить событие»
- Шесть документов T0 (демо): заполнение по шагам, предпросмотр A4, печать в 2 экземплярах с блоком отметки о приёме, текст под форму с ЕСИА со счётчиком знаков (только предупреждает)
- «Что пришло в ответ» (`/answer/`) с вариантами из графа
- «Отказали по телефону или при визите» (`/call/`): лист на 5 полей, печать пустым бланком без JS, с JS запись в дело
- «Ребёнку скоро 18» (`/turning-18/`): обратный расчёт по 208н п. 23 по рабочим дням с запасом 5 р.д., ориентиры семьи с пометкой «ориентир, не норма», печать A4 и `.ics`
- Хронология дела на A4 (печать той же страницы `case/` с классом `ok-print-timeline`)
- Адресаты: ведомства региона (ТО РЗН, минздрав, ТФОМС только телефоном) из `pal-directory`, федеральные из своего файла, все с `verified:false`
- Экспорт и импорт дел файлом, «Удалить всё с этого устройства», `persist()`, PWA офлайн
- `/data/`: версия пакета, статус «Демо», даты снимков соседей, список всего непроверенного
- `pack.schema.json`, `pack_lint.py` и фикстуры, включая обязательное падение на 345н
- Плашка `draft('legal')` на всех страницах сценариев, документов, `/answer/`, `/turning-18/` и на печати. На пакете отметка «Демо» и строка «Пример. Не используйте без проверки юристом в РФ»

### 1.2 Позже

- T1: медизделия (398н, 505н), МСЭ, льготные лекарства и питание, сертификат СФР. Только при живом юристе в РФ
- Адреса ТО РЗН, минздравов и прокуратур от мейнтейнера в РФ
- Обезличенный экспорт карточки дела (схема из C18), шифрованный бэкап, DOCX, проверка страниц под ЭЗП, QR, фото квитанций
- Сценарий «до 18 лет осталось меньше 90 рабочих дней», региональные записи 18+
- Параллельная подача в РЗН и прокуратуру при угрозе жизни
- Ежемесячная пересборка Pages по расписанию для «мёртвой руки» T1
- Подпись релизов

### 1.3 Не делаем

Автоматическое составление текстов, OCR, автоподачу, интеграцию с ПОС, синхронизацию, аккаунты, мультиклиентский режим, список подопечных, метки, поиск по делам, назначение исполнителей, выгрузки «для фонда», оценку шансов, рейтинги органов, бренд в документах, свой календарь, тексты «Веры» и «Про паллиатив».

## 2. Страницы и маршруты

Все пути от `/obrashchenie-kit/`. Слаги и названия из UX_MAP 2.2. `site.nav`: «Что произошло» (`""`), «Моё дело» (`case/`), «Что пришло в ответ» (`answer/`), «Ребёнку скоро 18» (`turning-18/`).

| Путь | H1 | Что на странице | Без JS | Печать |
|---|---|---|---|---|
| `/` | Заявления и жалобы | H2 «Что произошло?», строка «Поможем попросить ответ на бумаге, посчитаем, до какого числа его ждать, и подскажем, что можно сделать дальше. Документ составляете вы». Если есть дела: первой кнопка «Продолжить моё дело» и под ней «Ответ должен прийти до [дата]». 5 карточек сценариев. Ниже «Ещё»: «Ребёнку скоро 18», «Отказали по телефону», «Что пришло в ответ», «Как мы храним ваши данные» | карточки и «Ещё» | нет |
| `/scenarios/oral-refusal/` | Отказали на словах | «Что сделать сейчас» (3 шага), какие документы помогут (ссылки на `/docs/`), сроки словами со ссылкой `norm()` и статусом, «Если не получилось», внизу «Начать дело» (`case/#new=1&s=oral-refusal`) и `<op-share>` (только адрес страницы) | целиком | да, памятка |
| `/scenarios/no-answer/` | Не ответили в срок | то же; принимает `#rule=&from=` от pal-norms и передаёт в анкету | целиком | да |
| `/scenarios/vk-refused/` | Не созывают врачебную комиссию или отказали в заключении | то же, документы `vk-extract`, `written-answer` | целиком | да |
| `/scenarios/discharge/` | Выписывают домой | то же, ссылка «Распечатать чек-лист выписки» на hc `/discharge/` (чек-лист живёт там), документы `written-answer`, `med-records`, `vk-extract` | целиком | да |
| `/scenarios/forwarded/` | Жалобу переслали тому, на кого вы жалуетесь | то же, документ `repeat-complaint` | целиком | да |
| `/case/` | Моё дело | без дел: «Здесь будет ваше дело: документы, сроки и что делать дальше. Начните с того, что произошло» и сценарии. С `#new=1`: анкета. С делом: экран дела (ниже). Внизу блок «Файл дела»: «Сохранить файлом», «Открыть файл», «Удалить всё с этого устройства» (контурная danger, `<dialog>`) | текст «Для дела нужен JavaScript. Сценарии и пустые бланки работают и без него» со ссылками | хронология A4 |
| `/docs/<doc>/` (6 шт.) | название документа | что документ даёт и когда нужен, шаги «Заполнить», «Проверить», «Распечатать или отправить». Предпросмотр A4. Кнопки «Распечатать (2 экземпляра, N стр.)» и «Текст для формы на Госуслугах» | описание и пустой бланк A4 для ручки | да, 2 экземпляра |
| `/answer/` | Что пришло в ответ | 4 крупных варианта, «Уточнить» с 8 типами, после выбора: что это обычно значит одной строкой и 2-3 варианта из графа «Варианты. Решаете вы» с кнопками «Собрать документ» | список типов и вариантов текстом | нет |
| `/call/` | Отказали по телефону или при визите | лист на 5 полей: когда (дата, время), куда звонили или кто приходил, кто ответил (должность, ФИО если назвали), что сказали, что вы попросили. Подсказка «Попросите ответ на бумаге» со ссылкой на `docs/written-answer/`. С JS «Добавить в дело» | пустой бланк | да, 1 стр. |
| `/turning-18/` | Ребёнку скоро 18 | дата рождения тремя полями, кнопка «Посчитать», календарь вех таблицей, у каждой даты формула, норма или «ориентир, не норма». «Добавить в календарь» (.ics), «Распечатать». Ссылки «Что подписать заранее» (hc `/ahead/`), «Оборудование после 18» (dv `/`) | текст правила п. 23 словами и формула | да, 1 стр. |
| `/data/` | Пакет шаблонов и данные | версия и статус пакета, ревьюеры (нет), лицензии, даты снимков `pal-norms` и `pal-directory`, таблица «что не проверено» (нормы, правила сроков, каналы, федеральные адресаты, вехи 18) | целиком | нет |

### 2.1 Экран дела `/case/` (с JS)

Сверху вниз:

1. Строка дела без имён: «Отказали на словах · Калининградская область · начато 12.10.2026». Если дел несколько, переключатель списком (проблема и дата, без ФИО)
2. Блок срока: «Ответ должен прийти до пятницы, 14 ноября 2026» (22-24px, Onest 600), под ним формула («30 дней со дня регистрации, регистрация до 3 дней»), ссылка «Откуда этот срок» на pn `/deadlines/<rule_id>/#from=<дата>`, `op-status` «Не проверено» или «Календарь на [год] ещё не утверждён», если так вернул `computeDeadline`
3. Если срок прошёл: `op-status deadline` «Ответ не пришёл в срок. Это повод для следующего шага: жалоба в [адресат]» и главная кнопка «Собрать жалобу на нарушение срока»
4. Кнопки второго уровня: «Что пришло в ответ», «Добавить событие», «Добавить в календарь»
5. «Шаги» списком `<ol>`: пройденные с датой и `circle-check`, текущий, будущие серым с ожидаемой датой
6. «Журнал»: события по дате, у каждого «Исправить»
7. «Адресаты»: ведомства региона с телефонами (статусы из снимка), поле «Адрес впишите сами» с подсказкой «Адрес есть на сайте ведомства», ссылка на pd `/regions/<iso>/`
8. «Файл дела» и подсказка «Браузер может удалить данные сайта. Сохраните файл дела на телефон или компьютер», которая появляется после каждого собранного документа

### 2.2 Анкета `/case/#new=1`

`op-steps` «Шаг N из 4», один вопрос на экране, «Назад» и «Дальше» по 48px:

1. Что произошло: 5 сценариев (предвыбран из `#s=`)
2. Кто вы: «Я сам пациент», «По доверенности», «Опекун», «Родитель ребёнка». Подсказка, какие данные понадобятся
3. Регион: `<op-region>` (предвыбран из `op.region` или `#region=`). Пункт «Моего региона нет в списке» ведёт на федеральных адресатов
4. Когда и как отказали или куда подали: дата тремя полями, форма (на словах, по телефону, письменно, не ответили). Для `no-answer`: дата подачи и регистрационный номер, если есть

После шага 4 открывается дело с первым шагом и кнопкой «Собрать документ». Текст после сборки документа берётся из UX_MAP 7: «Документ готов. Что дальше: распечатайте и подпишите, отнесите или отправьте в [адресат], попросите отметку о приёме. Ответ должен прийти до [дата]» и «Добавить напоминание в календарь».

### 2.3 Первый экран телефона 360×640

- `/`: шапка (2 строки), `op-draft` в одну-две строки, H1, H2 «Что произошло?», кнопка «Продолжить моё дело» (если есть дело), карточки «Отказали на словах» и «Не ответили в срок». Остальное ниже прокрутки
- `/case/`: строка дела, блок срока с формулой, главная кнопка. Шаги и журнал ниже
- `/docs/<doc>/`: H1, одна строка «что даёт», `op-steps` «Шаг 1 из 3», первые 2 поля
- `/answer/`: H1 и 4 крупных варианта
- `/turning-18/`: H1, одна строка правила, три поля даты и «Посчитать»
- сценарий: H1, «Что сделать сейчас» с первым шагом и кнопкой «Начать дело»

### 2.4 Что принимает фрагмент

По UX_MAP 4.1 через `readParams` из `opsite/ui/js/xparams.js` (пока его нет, локальная копия `assets/js/ok-params.js` и строка в STATUS): `s`, `doc`, `device`, `nut`, `region`, `rule`, `from`, `norm`, `back`, `new`, `id`. `device` и `nut` проверяются только регуляркой (снимков `pal-devices-data` у kit нет) и попадают в дело как код без названия: «Изделие с кодом 303260» и ссылка на dv `/devices/303260/`. После разбора фрагмент убирается `history.replaceState`.

### 2.5 Состояния

Все из UX_MAP 6, которые относятся к ok: «Не проверено», «Пункт не проверен и в документ не включён», «Снимок устарел», «Календарь на год не утверждён», «Срок прошёл», «Нет дел», «Демо-данные», «Нет интернета», «Вышла новая версия», «Браузер не даёт хранить», «Без JS», «Ошибка в поле». Свои: «Дел уже 3. Закройте одно, чтобы начать новое», «Файл не подошёл: это не файл дел этого инструмента», «Файл слишком большой» (больше 1 МБ).

## 3. Данные

### 3.1 Свои файлы (`data/`, правят люди через PR)

Все YAML читаются `BaseLoader`, типы приводит схема. У каждой строки `verified`, `verified_at`, а если есть источник, `source_ref`.

**`data/meta.yaml`**: `data_date`, `version` (CalVer), `license_texts: CC-BY-SA-4.0`.

**`data/pack/pack.yaml`**

| Поле | Тип | MVP |
|---|---|---|
| `id` | строка | `t0-demo` |
| `version` | CalVer | `2026.10.11` |
| `status` | `demo` / `reviewed` | `demo` |
| `tiers_enabled` | список | `[T0]` |
| `reviewers` | список `{alias, role, since}` | `[]` |
| `reviewed_at` | дата или null | null |
| `released_at` | дата | дата сборки пакета |
| `expires_after_days` | число | 365 |
| `first_public_at` | дата или null | null (ставится при публикации, от неё считается правило 3 месяцев) |

**`data/pack/documents/<id>.yaml`** (6 файлов)

| Поле | Тип | Описание |
|---|---|---|
| `id` | слаг | `written-answer` и т. д. |
| `tier` | `T0` / `T1` | |
| `title` | строка | заголовок документа на листе: «Заявление», «Жалоба», «Запрос» |
| `name` | строка | название для людей на сайте |
| `gives` | строка | что документ даёт, одна строка |
| `addressee_kinds` | список | `mo_head`, `mo_vk`, `rzn_to`, `minzdrav_region`, `rzn_central`, `minzdrav_rf`, `prosecutor`, `none` |
| `roles` | список | `self`, `proxy`, `guardian`, `parent` |
| `fields` | список | `{id, label, hint, type: text/textarea/date/select/number, required, personal, autocomplete, max_len, options}` |
| `blocks` | список | `{id, roles?, when?, text, norm_refs[], fallback}`. `text` и `fallback` с `{{field}}`, `{{date:field}}`, `{{norm:id}}`, `{{norm:id#p-N}}`, `{{addressee}}` |
| `copies` | число | 2 |
| `receipt_block` | bool | блок «Принято» на экземпляре заявителя |
| `channels` | список id из `channels.yaml` | |
| `esia_summary` | строка с плейсхолдерами | короткий текст под форму |
| `attachments_hint` | список строк | что приложить |
| `reviewed_by`, `reviewed_at` | | пусто в MVP |
| `verified`, `verified_at` | | `false`, null |

Шесть документов T0 (id из UX_MAP 2.2):

| id | Что | Адресат | Нормы в блоках | Fallback, если норма не проверена |
|---|---|---|---|---|
| `written-answer` | просьба дать письменный ответ или решение вместо устного отказа | `mo_head` | нет (процедурная просьба) | не нужен |
| `vk-extract` | запрос выписки из протокола ВК или копии заключения | `mo_head` | `180n#p-16` | «Прошу выдать мне выписку из протокола заседания врачебной комиссии в установленный срок» |
| `med-records` | запрос копий медицинских документов и выписок | `mo_head` | `789n#p-8` | «Прошу выдать копии медицинских документов и выписки из них в установленный срок» |
| `deadline-complaint` | жалоба на нарушение срока ответа | `rzn_to`, `minzdrav_region` | `59-fz#st-12` | «Ответ на моё обращение от {{date:filed_at}} в установленный срок не получен» |
| `repeat-complaint` | повторная жалоба: ответ не по существу или переслали тому, на кого жалуюсь | на уровень выше обжалуемого | `59-fz#st-8-ch-6` | «Прошу не направлять эту жалобу в орган или должностному лицу, чьи решения или действия я обжалую» |
| `filing-sheet` | опись приложений и отметка о приёме | `none` | нет | не нужен |

Блоки роли: заявитель сам, по доверенности (вид, номер, дата), опекун (реквизиты акта органа опеки), родитель (свидетельство о рождении ребёнка). Тексты блоков роли процедурные и тоже демо.

**`data/pack/graph.yaml`**: узлы и рёбра лестницы.

- узлы: `mo_head`, `mo_vk`, `rzn_to`, `minzdrav_region`, `rzn_central`, `minzdrav_rf`, `prosecutor`. У узла `label`, `level` (1 МО, 2 регион, 3 федеральный), `addressee_source` (`pal-directory:rzn`, `pal-directory:minzdrav`, `federal:<id>`, `user`)
- рёбра: `{id, from_condition, respondent_level, to, doc, rule_id, norm_refs, label}`. `from_condition`: `oral_refusal`, `vk_not_held`, `no_answer`, `deadline_passed`, `answer_refusal_with_basis`, `answer_refusal_no_basis`, `answer_not_on_merits`, `forwarded_to_respondent`, `forwarded_other`, `extended`, `docs_requested`, `discharge_planned`
- граф публикуется и в pn `/escalation/` не дублируется: kit даёт ссылку на pn для обоснования ступени

**`data/pack/reply-types.yaml`**: 4 основных (`none`, `refusal`, `forwarded`, `other`) и 8 уточнений (`resolved`, `refusal_with_basis`, `refusal_no_basis`, `explanation_only`, `forwarded_to_respondent`, `forwarded_other`, `extended`, `docs_requested`) плюс `unknown`. Поля: `id`, `parent`, `label`, `hint`, `condition` (ключ в графе), `meaning` (одна строка без оценки). Тест: у каждого типа, кроме `resolved`, есть хотя бы один вариант в графе.

**`data/pack/channels.yaml`**: `{id, label, kind: paper/esia_form/ezp, limit_chars, limit_files, limit_mb, limit_pages, url, source_ref, verified, verified_at}`. MVP: `paper-in-person`, `paper-mail`, `esia-minzdrav-rf` (2000 знаков, 1 файл до 5 МБ, источник minzdrav.gov.ru/reception), `esia-pos` (лимиты неизвестны, null), `ezp` (5 стр. PDF в приложении, 19 стр. и 10 МБ на сайте, источник пост «Про паллиатив»). Все `verified:false`: сайты российские, из AT мы их не сверяли.

**`data/pack/addressees-federal.yaml`**: `{id, label, level, url, how: link_only/form/address_user, source_ref, verified, verified_at}`. MVP: Росздравнадзор (центральный аппарат), Минздрав России, прокуратура (через `https://epp.genproc.gov.ru` ссылкой). Почтовых адресов нет, `verified:false`.

**`data/pack/turning18.yaml`**: вехи `{id, kind: obligation_mo/family_orientir/fact, label, rule_id?, offset?, unit: working/calendar/months, direction: backward, margin_wd, norm_refs, text, verified, verified_at, source_ref}`:

- `birthday-18` (fact): день 18-летия
- `p23-extract` (obligation_mo): 208н п. 23, 90 р.д. до 18-летия, `margin_wd: 5`. Текст: «Последний день, когда медицинская организация должна направить выписку во взрослую поликлинику и взрослую паллиативную службу. Попросите об этом заранее, до [дата с запасом]»
- `representation-orientir` (family_orientir, `verified:false`): «Если нужен опекун или представитель, семьи советуют начинать за 6 месяцев и раньше. Это ориентир, а не срок из закона»
- `mse-orientir` (family_orientir, `verified:false`): «Направление на МСЭ до 18 лет семьи советуют просить за 2-3 месяца. Это ориентир, а не срок из закона»

**`data/scenarios.yaml`** (публикуется): `{id, slug, title, hint, situations[], icon, first_steps[3], docs[], rule_ids[], if_failed[], see_also[{repo, path, label}], start_condition}`. 5 сценариев. Тексты страниц длиннее строки живут в `content/scenarios/<id>.md` у SITE.

**`data/entrypoints.yaml`**: 9 записей из UX_MAP 10 (`oral-refusal`, `vk-refused`, `discharge`, `forwarded`, `no-answer`, `case`, `answer`, `call`, `turning-18`), `maturity: demo`, `audience: [family]`.

### 3.2 Схемы (`data/schema/`, пишет DATA первым делом)

`scenarios.schema.json`, `documents.schema.json`, `graph.schema.json`, `reply-types.schema.json`, `channels.schema.json`, `addressees-federal.schema.json`, `turning18.schema.json`, `pack.schema.json` (метаданные пакета и вход для линта: все файлы `data/pack/` в одном объекте), `case-backup.schema.json` (файл экспорта дел, раздел 3.6). Все draft 2020-12, сообщения через `x-message-ru`.

### 3.3 Синтаксис шаблона и разрешение норм при сборке

- `{{field_id}}` поле человека, `{{date:field_id}}` дата словами («12 октября 2026 г.»), `{{addressee}}` название адресата, `{{norm:id}}` и `{{norm:id#p-N}}` ссылка на норму
- `pipeline/export.py` для каждого блока с `norm_refs`: берёт акт из `vendor/pal-norms/v1/acts.json`; если `status == in_force` и `verified == true`, подставляет «пунктом 16 [title] ([issuer] от [date] № [number])» из полей акта, `norm_state: ok`; иначе берёт `fallback`, `norm_state: fallback`, `norm_reason: repealed/unverified/unknown`. Номер акта в готовом тексте берётся только из данных `pal-norms`, в шаблоне его нет
- на странице документа у блока с `fallback` видна строка «Ссылка на норму не включена: норма не проверена» со ссылкой на pn
- Сроки в тексте документа не пишутся никогда, только «в установленный срок». Срок с формулой живёт на экране дела

### 3.4 Источники (проверено 11.10.2026 из AT)

| Что | Где | Как получено | Локально | Статус |
|---|---|---|---|---|
| 208н/243н п. 23 (90 р.д. до 18 лет), п. 20 (2 р.д.) | http://publication.pravo.gov.ru/document/0001202505290031, PDF `/file/pdf?eoNumber=0001202505290031` | OCR tesseract rus | `raw/pravo/0001202505290031-p8.ocr.txt` (п. 23); страницы с п. 20 в `raw/` не сохранены | цитата дословно есть, владелец `pal-norms` |
| 180н п. 16 (выписка из протокола ВК, 3 р.д. со дня поступления запроса) | eoNumber `0001202505160009` | OCR | `raw/pravo/0001202505160009-p4.ocr.txt` | есть, владелец `pal-norms` |
| 789н п. 8 (копии и выписки: сроки 59-ФЗ, в стационаре в суточный срок) | eoNumber `0001202009240027` | OCR | `raw/pravo/0001202009240027-p5.ocr.txt` | есть. eoNumber `0001202009100020` относится к другому приказу (посещение родственниками), не путать |
| 59-ФЗ ст. 8 ч. 2, 3, 6; ст. 12 ч. 1 | http://kremlin.ru/acts/bank/23764 и `/page/2` (текст с отметками редакций до 547-ФЗ) | `curl https://r.jina.ai/http://kremlin.ru/acts/bank/23764` | `raw/ips/59-fz-st8-st12.md`, sha256 в `raw/SOURCES.tsv` | дословный текст есть, но не с портала официальной публикации и без eoNumber: `verified:false` до сверки мейнтейнером в РФ по ИПС pravo.gov.ru. Передать в `pal-norms` |
| 547-ФЗ (ЕСИА для электронных обращений) | eoNumber `0001202412280052` | OCR | `raw/pravo/0001202412280052.meta.json` | для страницы «как подать», владелец `pal-norms` |
| 345н/372н (отменён) | eoNumber `0001201906270031` | | | только для фикстуры `bad-345n` |
| Ведомства и телефоны регионов | xlsx горячих линий РЗН | парсит `pal-directory` | файл горячих линий РЗН от 03.03.2026 в репо `pal-directory` (262 строки, без почтовых адресов) | `addressees` true по названию, `region-lines` false |
| Лимиты формы Минздрава России | https://minzdrav.gov.ru/reception | из исследования `R_obr_tools.md` §2.5 | | `verified:false` |
| Лимиты ЭЗП | https://pro-palliativ.ru/library/items/podat-elektronnoe-obrashchenie-v-gosorgany-mozhno-cherez-pochtu-rossii | `R_obr_tools.md` §2.9, вторичный источник | | `verified:false` |
| Прокуратура | https://epp.genproc.gov.ru | только ссылка | | `verified:false` |
| Производственный календарь | `pal-norms` `calendar.json` (ПП 1335, 1466, 1187 с eoNumber) | | | владелец `pal-norms` |

Kit в рантайме и при сборке к этим адресам не обращается. Внешние ссылки только в `<a>` с иконкой `external-link` и подписью «откроется сайт [домен]».

### 3.5 Что kit ожидает от соседей (контракт)

**`pal-norms`** (`deps.yaml`: `acts`, `deadline-rules`, `calendar`, `escalation`; `lib: [deadlines.js]`):

- `acts`: у элемента `id`, `status`, `verified`, `title`, `short_title`, `issuer`, `date`, `number`, `eoNumber`, `url`, `replaced_by`. Норма без `title`/`number`/`date` считается непроверенной для документа
- `deadline-rules`: kit ссылается на id `59fz-registration` (3 дня, ч. 2 ст. 8), `59fz-redirect` (7 дней, ч. 3 ст. 8), `59fz-answer` (30 дней со дня регистрации, ч. 1 ст. 12), `180n-vk-extract` (3 р.д., п. 16), `789n-copies-inpatient` (сутки, п. 8), `789n-copies` (ссылка на `59fz-answer`), `208n-p23` (90 р.д. назад от 18-летия, `direction: backward`). Если `pal-norms` назовёт иначе, DATA правит id только в `data/` этого репо
- `computeDeadline({rule, start, calendar}) -> {due, formula, steps, rule_id, norm_ids, ambiguous, calendar_verified}` (PLATFORM 4.2). Для `208n-p23` нужен `direction: "backward"`. Если в снимке его нет, SITE пишет `lib/workdays.js` (до 60 строк, только обратный счёт рабочих дней по `calendar.json`, запас 5 р.д. применяет `lib/turning18.js`) и строку в STATUS «В платформу»
- конец 30-дневного срока на выходном: `ambiguous:true` (перенос по аналогии со ст. 193 ГК - толкование). UI пишет «Если последний день выпадает на выходной, ответ могут прислать в ближайший рабочий день»

**`pal-directory`** (`deps.yaml`: `regions`, `addressees`, `region-lines`, `federal-lines`): поля по его ARCHITECTURE 3.2, 3.3 и 4.1. Kit использует `regions.id/name/name_genitive`, `addressees.{id, region_id, agency, name, line_ids, postal_address}`, `region-lines.{id, tel, number_display, hours_text, is_24x7, roles, origin, verified, verified_at, source_ref}`, `federal-lines`. ТФОМС показывается только телефоном, адресатом жалобы на ВК не предлагается.

### 3.6 Данные на устройстве

IndexedDB `op-obrashchenie-kit` через `openStore`:

```json
{
  "key": "case:k3f9a2m8q1",
  "value": {
    "id": "k3f9a2m8q1", "schema": 1, "created_at": "2026-10-12", "closed_at": null,
    "scenario": "oral-refusal", "role": "proxy", "region_id": "RU-KGD",
    "respondent_level": 1, "device": null, "nut": null,
    "pack_version": "2026.10.11",
    "addressees": { "mo_head": { "name": "Главному врачу ГБУЗ (вписал человек)", "address": "" } },
    "docs": { "written-answer": { "fields": { "request": "..." }, "built_at": "2026-10-12" } },
    "events": [
      { "seq": 1, "at": "2026-10-10", "type": "oral_refusal", "channel": "visit", "note": "", "edited_at": null },
      { "seq": 2, "at": "2026-10-12", "type": "filed", "doc": "written-answer", "to": "mo_head", "channel": "paper-in-person", "reg_number": "", "edited_at": null }
    ]
  }
}
```

- типы событий: `oral_refusal`, `call`, `filed`, `registered`, `reply` (с `reply_type`), `forwarded` (`to_respondent: true/false`), `extended` (новая дата вписывается человеком), `docs_requested`, `note`, `closed`
- сроки не хранятся, `lib/case.js` вычисляет их из событий и снимка при каждом открытии. Если после импорта или обновления снимка дата сдвинулась, рядом строка «Дата пересчитана по новым данным: было 13.11, стало 14.11»
- `note` до 500 знаков, подсказка «Не пишите диагнозы и лишние личные данные»
- `profile` только при галочке: ФИО, адрес, телефон, e-mail заявителя, реквизиты доверенности или акта опеки
- экспорт: `store.exportAll()` → `openpalliative-backup/1`, имя файла `dela-2026-10-12.json`. Импорт: размер до 1 МБ, `case-backup.schema.json`, проверка `repo`, слияние по ключу с вопросом «В файле есть дело, которое уже есть на устройстве. Заменить?». Тексты из файла выводятся только через `textContent`
- при создании первого дела `navigator.storage.persist()`. Если отказ или режим инкогнито, состояние «Браузер не даёт хранить»
- «Удалить всё с этого устройства» вызывает только `store.wipe()` этой базы и ключи `op.ok.*`, перед этим кнопка «Сохранить копию дел файлом»

### 3.7 Fail closed

- сборка: `pack_lint` падает, если блок ссылается на норму не `in_force` и у блока нет `fallback`; если номер акта написан литералом; если ребро ведёт в обжалуемый уровень. Блок с непроверенной нормой и с `fallback` собирается через `fallback`
- браузер: `lib/render-doc.js` бросает ошибку на блоке без `text` и без `fallback`, на поле `required` без значения не даёт печатать («Заполните поле [label]»), на неизвестном плейсхолдере показывает «Пункт не проверен и в документ не включён»
- сроки с `verified:false` или `ambiguous:true` никогда не попадают в документ и на экране дела всегда со статусом

## 4. Снимки

### 4.1 Публикуем (`_site/data/v1/`, CC BY-SA 4.0 для текстов)

| Датасет | items | Кто берёт |
|---|---|---|
| `scenarios` | 5 | хаб (страницы ситуаций), pn и dv для подписей ссылок |
| `documents` | 6, тексты уже разрешены по нормам | pn `/escalation/` (подписи «Собрать документ»), внешние пользователи |
| `ladder` | рёбра графа | pn для сверки, внешние пользователи |
| `reply-types` | 13 | |
| `channels` | 5 | |
| `addressees-federal` | 3 | |
| `turning18` | 4 | hc `/ahead/` может показать дату п. 23 ссылкой |
| `pack` | 1 (метаданные пакета) | хаб (отметка «Демо») |
| `entrypoints` | 9 | хаб |

Плюс `_site/schema/case-backup.schema.json` (копирует `site_hooks.py`) для тех, кто пишет совместимые инструменты.

### 4.2 Берём (`deps.yaml`)

```yaml
pal-norms:
  major: 1
  datasets: [acts, deadline-rules, calendar, escalation]
  lib: [deadlines.js]
pal-directory:
  major: 1
  datasets: [regions, addressees, region-lines, federal-lines]
```

`tools: [pack_lint.py]` добавляется только когда версия `pal-norms` пройдёт фикстуры kit (K7).

## 5. Автоматизация

| Файл | Когда | Что делает | Что само попадает в main |
|---|---|---|---|
| `checks.yml` | PR и push | PLATFORM 6.2: pytest, build (внутри `pack_lint`), `opsite check --ci`, `pnpm test:unit`, `pnpm test:e2e`, при падении `_reports/` в артефакт | ничего |
| `pages.yml` | push в main, вручную | PLATFORM 6.1 | ничего |
| `sync-data.yml` | `cron: "43 5 * * 2"` и вручную | 1) `opsite sync-data --from pages`; 2) build и check; 3) если в `vendor/` или `deps.yaml` разница: PR `sync/<дата>` через `create-pull-request`. Метка `facts`, если изменились только `calendar` или `region-lines` и сборка зелёная. 4) если сборка упала на `norm_repealed` или `norm_unverified`: PR всё равно открывается (красный), плюс issue «Пакет заблокирован: норма [id] сменила статус, затронуты документы [ids]» с меткой `review:legal`; дубли отсекаются по `sha256(kind+norm_id+status)` в заголовке. 5) если снимок старше 90 дней: issue «Снимок [repo]/[name] устарел» | ничего: `data/snapshots/upstream.json` (`checked_at`, версии и `content_sha256` снимков соседей) обновляется в том же PR, когда снимки поменялись. Сайт его не читает. После PR workflow запускает `checks.yml` на ветке PR, последний шаг включает `sync-data.yml` через `PUT .../enable`, чтобы GitHub не выключил расписание |
| то же, job `review-due` | первый вторник месяца, без сети | `uv run python -m pipeline.review_due` пишет `_reports/review.json` и открывает issues: пакет старше `expires_after_days`; у каналов и федеральных адресатов `verified:false` или `verified_at` старше 180 дней (одна сводная issue); после 1 октября в `calendar` нет года `Y+1` с `verified:true`; `first_public_at` старше 90 дней, а `reviewers` пуст: issue «Архивировать kit? Три месяца демо без юриста» | ничего |
| `release.yml` | тег `v*` | PLATFORM 6.5: zip `_site` и sha256 | ничего |

Тексты документов, адресаты, лимиты и вехи меняются только через PR, который смотрит человек. Прямых коммитов ботов в main нет.

## 6. Дерево файлов и владение

```
obrashchenie-kit/
├── README.md ARCHITECTURE.md LICENSE LICENSE-DATA            [INT] [ARCH]; README: «нужен мейнтейнер в РФ», правило 3 месяцев, CRM-запрет
├── CONTRIBUTING.md                                           [INT] запрет мультиклиентского режима, списков подопечных, меток, интеграций с CRM
├── site.yaml deps.yaml pyproject.toml uv.lock .python-version  [INT]
├── package.json pnpm-lock.yaml .node-version playwright.config.js .gitignore  [INT]
├── data/                                                     [DATA]
│   ├── meta.yaml  scenarios.yaml  entrypoints.yaml
│   ├── pack/pack.yaml  pack/graph.yaml  pack/reply-types.yaml  pack/channels.yaml
│   ├── pack/addressees-federal.yaml  pack/turning18.yaml
│   ├── pack/documents/{written-answer,vk-extract,med-records,deadline-complaint,repeat-complaint,filing-sheet}.yaml
│   ├── snapshots/upstream.json
│   └── schema/*.schema.json
├── pipeline/                                                 [DATA]
│   ├── __init__.py  export.py  pack_lint.py  resolve.py  review_due.py
│   └── tests/test_schema.py  test_pack_lint.py  test_export.py  test_review_due.py
│       └── fixtures/packs/{good,bad-345n,bad-literal,bad-edge,bad-fallback,bad-placeholder,bad-territory,bad-brand,bad-drugs,bad-t1-expired}/
├── tests/fixtures/                                           [DATA] синтетика для SITE, проходит те же схемы
│   ├── documents.json scenarios.json ladder.json reply-types.json channels.json addressees-federal.json turning18.json pack.json
│   ├── vendor/pal-norms/v1/{acts,deadline-rules,calendar,escalation}.json  vendor/pal-norms/lib/deadlines.js (заглушка с тем же API)
│   ├── vendor/pal-directory/v1/{regions,addressees,region-lines,federal-lines}.json
│   └── backups/{good,wrong-repo,too-big,bad-schema}.json
├── tests/golden/                                             [DATA] case-deadlines.yaml, turning18.yaml (ожидаемые даты по официальному календарю)
├── lib/                                                      [SITE] case.js ladder.js render-doc.js turning18.js backup.js (workdays.js при надобности)
├── content/                                                  [SITE] pages/*.md, scenarios/<id>.md, ui.yaml (подписи), call.yaml (поля листа звонка)
├── templates/pages/                                          [SITE] index, scenarios/*, case, docs (через site_hooks), answer, call, turning-18, data
├── templates/partials/                                       [SITE] ok-doc.html.j2 (макрос листа, он же <template> для JS), ok-date.html.j2, ok-ladder.html.j2
├── assets/css/ok.css  assets/js/{home,wizard,case-page,doc-page,answer-page,t18-page,ok-params}.js  [SITE]
├── site_hooks.py                                             [SITE] страницы docs/<id>/ из documents, копия case-backup.schema.json
├── tests/unit/*.test.js                                      [SITE] node --test
├── tests/e2e/*.spec.js  tests/e2e/pages.json                 [SITE]
├── opsite/  vendor/                                          [SYNC]
├── scripts/ .github/workflows/{checks,pages,sync-data,release}.yml   [INT]
└── _site/ _reports/                                          в .gitignore
```

### 6.1 Порядок и контракт DATA → SITE

1. **DATA, шаг 0 (первым):** схемы `data/schema/*`, все `tests/fixtures/*` и `pipeline/export.py`, который при отсутствии `vendor/` берёт `tests/fixtures/vendor/` (переменная `OK_VENDOR=fixtures`, по умолчанию `auto`: настоящий `vendor/`, если он есть). С этого момента у SITE проходит `uv run python -m opsite build`
2. SITE работает только с опубликованными конвертами (`ctx.data[...]`, `ctx.vendor[...]`, `data/v1/*.json` в браузере). Имена полей из раздела 3 менять может только DATA, и только вместе с фикстурами
3. Функции `lib/` (контракт для node-тестов и страниц):
   - `reduceCase(caseObj, {rules, calendar, computeDeadline, today}) -> {stage, deadlines[{id, rule_id, due, formula, ambiguous, calendar_verified, verified, overdue}], next, conditions[]}`; `stage`: `prepare`, `filed`, `waiting`, `overdue`, `answered`, `closed`
   - `options(condition, respondentLevel, ladder) -> [{edge_id, doc, to, label}]`, никогда не возвращает `to` с уровнем обжалуемого
   - `renderDoc(doc, values, {role, addressee, copy: 1|2}) -> {blocks[{id, text}], missing[], esiaText, chars}`
   - `turning18(birthDate, {items, rules, calendar, computeDeadline}) -> [{id, date, margin_date, formula, kind, verified, calendar_verified}]`
   - `parseBackup(text, {maxBytes}) -> {ok, cases, error_ru}`
4. Golden-файлы DATA: строки «события → ожидаемые даты и флаги» и «дата рождения → даты вех». SITE читает их в `tests/unit/` и не правит
5. Связь с `pal-norms`: после его сборки DATA делает `uv run python -m opsite sync-data --from local`, сверяет id правил и поля актов с разделом 3.5, правит `data/`, при расхождении пишет в STATUS

### 6.2 Синтетический пример для старта сайта

`tests/fixtures/documents.json` (фрагмент, один документ):

```json
{
  "format": "openpalliative-dataset/1", "dataset": "documents", "repo": "obrashchenie-kit",
  "schema_version": "1.0.0", "version": "2026.10.11", "generated_at": "2026-10-11T12:00:00Z",
  "data_date": "2026-10-11", "stale_after_days": 365, "license": "CC-BY-SA-4.0",
  "source": [{ "id": "synthetic", "title": "Пример на выдуманных данных" }],
  "content_sha256": "0000000000000000000000000000000000000000000000000000000000000000",
  "counts": { "items": 1, "unverified": 1, "excluded": 0 },
  "items": [
    {
      "id": "deadline-complaint", "tier": "T0", "title": "Жалоба", "name": "Жалоба на нарушение срока ответа",
      "gives": "Вышестоящий орган узнаёт, что вам не ответили, и может потребовать ответ",
      "addressee_kinds": ["rzn_to", "minzdrav_region"], "roles": ["self", "proxy", "guardian", "parent"],
      "fields": [
        { "id": "applicant_name", "label": "Ваши фамилия, имя, отчество", "hint": "Как в паспорте", "type": "text", "required": true, "personal": true, "autocomplete": "name", "max_len": 120 },
        { "id": "filed_at", "label": "Когда вы подали обращение", "hint": "Дата на вашем экземпляре", "type": "date", "required": true, "personal": false },
        { "id": "reg_number", "label": "Номер регистрации, если есть", "hint": "Его ставят на вашем экземпляре", "type": "text", "required": false, "personal": false, "max_len": 40 }
      ],
      "blocks": [
        { "id": "facts", "text": "Ответ на моё обращение от {{date:filed_at}} в установленный срок не получен.", "norm_state": "fallback", "norm_reason": "unverified", "norm_refs": ["59-fz#st-12"] },
        { "id": "request", "text": "Прошу проверить соблюдение срока рассмотрения моего обращения и сообщить мне о результатах.", "norm_state": "none", "norm_refs": [] }
      ],
      "copies": 2, "receipt_block": true, "channels": ["paper-in-person", "paper-mail", "esia-minzdrav-rf"],
      "esia_summary": "Ответ на моё обращение от {{date:filed_at}} не получен. Прошу проверить соблюдение срока. Документ во вложении.",
      "attachments_hint": ["копия обращения с отметкой о приёме или квитанция"],
      "maturity": "demo", "verified": false, "verified_at": null
    }
  ]
}
```

`tests/fixtures/vendor/pal-norms/v1/acts.json`: 4 акта с выдуманными реквизитами и пометкой «пример»: `180n` (`in_force`, true), `789n` (`in_force`, true), `59-fz` (`in_force`, false), `345n-372n` (`repealed`, true). `deadline-rules.json`: 7 правил из раздела 3.5 с формулами. `calendar.json`: 2026 и 2027 `verified:true`, 2028 нет. `deadlines.js`-заглушка с тем же API и простым счётом, чтобы SITE не ждал `pal-norms`. Фикстуры `pal-directory` берутся из его `tests/fixtures/` как есть (RU-KGD, RU-IRK, RU-MOW, RU-CHU).

`tests/fixtures/backups/good.json`: одно дело из раздела 3.6 в обёртке `openpalliative-backup/1`.

## 7. Тесты и приёмка

### 7.1 Команды

```sh
cd obrashchenie-kit
uv sync --frozen && pnpm install --frozen-lockfile
uv run pytest -q
uv run python -m opsite build
uv run python -m opsite check
pnpm test:unit
pnpm test:e2e
pnpm shots
sh scripts/gate.sh
```

### 7.2 pytest (DATA)

- все файлы `data/` проходят свои схемы, все фикстуры тоже
- `pack_lint` на `fixtures/packs/`, у каждого плохого пакета ровно свой код:
  - `bad-345n` → `norm_repealed` (обязательный тест плана проекта)
  - `bad-literal` → `literal_act` (регэкспы `№\s?\d+`, `\b\d+\s?н\b`, `\b\d+-ФЗ\b`, `\b\d+-р\b`, `\bПП\s?№`, только по `text`, `fallback`, `esia_summary`)
  - `bad-edge` → `edge_to_respondent`
  - `bad-fallback` → `no_fallback`
  - `bad-placeholder` → `unknown_placeholder`
  - `bad-territory` → `excluded_territory` (словарь `opsite/lint/territories.yaml`)
  - `bad-brand` → `doc_brand` (латиница или `openpalliative` в тексте документа)
  - `bad-drugs` → `stoplist` (`opsite/lint/drugs.txt` и регэксп доз)
  - `bad-t1-expired` → `t1_expired`; плюс `t1_reviewers` (меньше двух ревьюеров у T1)
  - `good` проходит, `norm_unverified` у блока с fallback даёт предупреждение, а не ошибку
- `export.py`: блок с нормой `59-fz` уходит в fallback с `norm_reason: unverified`; блок с `180n` получает текст с реквизитами из `acts`; в `documents.json` нет литералов номера в исходных полях; территорий нет в выходе
- `review_due.py` на синтетике: пакет просрочен, канал старше 180 дней, нет календаря на следующий год, 90 дней без юриста дают ровно 4 записи

### 7.3 node --test (SITE, `tests/unit/`)

- `case.test.js`: по `tests/golden/case-deadlines.yaml` события → этап, даты, флаги. Обязательные случаи: подача 28.12.2026 через новогодние праздники, срок в майские праздники 2027, срок около 04.11.2026, конец 30-дневного срока на субботе (`ambiguous`), продление, переслали обжалуемому
- `ladder.test.js`: для каждого `condition` и каждого `respondent_level` нет варианта в тот же уровень; у каждого типа ответа, кроме `resolved`, есть вариант
- `render-doc.test.js`: 2 экземпляра, блок «Принято» только на втором, обязательные поля, плейсхолдер без значения, `esiaText` и счётчик, нет латиницы в тексте
- `turning18.test.js`: по `tests/golden/turning18.yaml`: 18-летие в выходной, 31.12, майские, 2028 с `calendar_verified:false` и датой не позже, чем при счёте только по выходным
- `backup.test.js`: хороший файл, чужой `repo`, больше 1 МБ, битая схема, HTML в заметке остаётся текстом
- `ics.test.js` (поверх `opsite/ui/js/ics.js`): CRLF, `VALUE=DATE`, `VALARM`, в SUMMARY нет имён и названий МО

### 7.4 Playwright (SITE, `tests/e2e/`)

- `pages.json`: `/`, 5 сценариев (`nojs: true`, `print_pages: 1` или 2), `/docs/written-answer/` (`nojs: true`, пустой бланк), `/answer/` (`nojs: true`), `/call/` (`nojs: true`, `print_pages: 1`), `/turning-18/` (`nojs: true`), `/data/`, `/case/`
- `s0.spec.js` (mobile): `/scenarios/oral-refusal/` → «Начать дело» → анкета 4 шага → дело → `written-answer` → печать: PDF 2 экземпляра с ожидаемым числом страниц, в PDF нет строки `openpalliative` и названия сайта → «Добавить в календарь» скачивает `.ics` → событие «Подали» → «Что пришло в ответ» → «Переслали» → «тому, на кого жалуюсь» → варианты без уровня обжалуемого → `repeat-complaint` с fallback-просьбой и без номера статьи
- `no-answer.spec.js`: вход `case/#new=1&s=no-answer&rule=59fz-answer&from=2026-09-01` → дело со статусом «Срок» и главной кнопкой «Собрать жалобу на нарушение срока»; фрагмент убран из адреса
- `turning18.spec.js`: дата рождения тремя полями → таблица вех → печать 1 стр. → `.ics`
- `backup.spec.js`: экспорт → «Удалить всё» через `<dialog>` → импорт → дело на месте; битый файл даёт русскую ошибку
- `offline.spec.js`: первый визит, `serviceWorker.ready`, офлайн, перезагрузка `/case/` и `/docs/written-answer/` работают; плашка «Вышла новая версия»
- `params.spec.js`: `#s=evil&region=RU-XXX&name=Иванов` отбрасывается молча, ФИО в адрес не попадает
- общие проверки из fixtures: сторож сети (0 внешних запросов), axe без serious и critical, нет ошибок консоли, нет горизонтальной прокрутки на 390px, один `h1`, ссылки подчёркнуты

### 7.5 Приёмка

1. `sh scripts/gate.sh` выходит с 0, `_reports/gate.json` без ошибок
2. `pack_lint` падает на `bad-345n` с `norm_repealed`, и это проверяет pytest
3. На `http://localhost:8703/obrashchenie-kit/` и на `http://localhost:8080/obrashchenie-kit/` проходит S0 целиком с телефона (390×844)
4. Скриншоты desktop и mobile, светлая и тёмная тема, печать документа и хронологии просмотрены глазами (PLATFORM 7.3), найденное исправлено
5. В `_site` нет длинных тире, эмодзи, литералов номеров актов в шаблонах, территорий, слов из стоп-листа; JS до 1500 строк
6. Каждая непроверенная вещь (59-ФЗ, каналы, федеральные адресаты, ориентиры 18 лет, номера региона) видна со статусом «Не проверено» и есть в таблице `/data/`
7. Межрепные ссылки (pn `/deadlines/`, pd `/regions/`, hc `/discharge/`, `/ahead/`, dv `/`) живые на 8080, хаб видит 9 `entrypoints`

## 8. В STATUS.md

**В платформу:**
- `pack_lint.py` перенести в `pal-norms/tools/` после того, как он пройдёт фикстуры kit (K7)
- `computeDeadline` с `direction: "backward"` и `margin_wd` в `pal-norms`; до этого `lib/workdays.js` в kit
- служебного коммита `data/snapshots/upstream.json` в main больше нет: файл едет в PR снимков, расписание держит шаг `PUT .../enable` (как в шаблоне хаба)
- макрос даты тремя полями (`ok_date`) поднять в `opsite` как `date3()`
- `ics.js`: события на весь день `VALUE=DATE`, если сейчас не так
- `xparams.js` с `readParams`; до этого `assets/js/ok-params.js`
- в `opsite/tools.yaml` название «Обращения и сроки» заменить на «Заявления и жалобы» (UX_MAP 1)
- 59-ФЗ: текст с kremlin.ru (`raw/ips/59-fz-st8-st12.md`) передать в `pal-norms` как источник со статусом `verified:false`

**Решить Кириллу:**
- публиковать ли на Pages номера регионов из таблицы РЗН до двух мейнтейнеров в РФ (сейчас kit показывает то, что отдаёт `pal-directory`, в режиме `demo` синтетика без `tel:`)
- оставить ли kit в MVP с `first_public_at: null` (правило 3 месяцев начинает считаться только с публикации)
