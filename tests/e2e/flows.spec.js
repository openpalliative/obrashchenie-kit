import { test, expect, checkA11y } from "../../opsite/tests/fixtures.js";
import { open, fillDate, fillDoc, seedCases, makeCase, storeDump, isoShift } from "./helpers.js";

const XSS = "<img src=x onerror=alert(1)>";
const TYPES = [
  ["none"], ["refusal"], ["forwarded"], ["other"],
  ["resolved", "Другое или не знаю"], ["refusal_with_basis", "Отказали"], ["refusal_no_basis", "Отказали"],
  ["explanation_only", "Другое или не знаю"], ["forwarded_to_respondent", "Переслали"], ["forwarded_other", "Переслали"],
  ["extended", "Другое или не знаю"], ["docs_requested", "Другое или не знаю"], ["unknown", "Другое или не знаю"],
];

test("что пришло в ответ: все 13 типов дают смысл и варианты @xb", async ({ page }) => {
  await open(page, "answer/");
  await expect(page.locator(".ok-big__item")).toHaveCount(4);
  for (const [id, parent] of TYPES) {
    if (parent) {
      await page.locator("label.ok-big__item", { hasText: parent }).click();
      await page.locator(`input[name=reply][value=${id}]`).check();
    } else {
      await page.locator(`.ok-big input[value=${id}]`).check();
    }
    const res = page.locator("[data-result]");
    await expect(res).toBeVisible();
    await expect(res.locator("[data-meaning]")).not.toHaveText("");
    expect(await res.locator("[data-optlist] li").count(), id).toBeGreaterThan(0);
  }
  await checkA11y(page);
});

test("ответ в дело для каждого типа пишет событие", async ({ page }) => {
  await seedCases(page, [makeCase({ events: [{ seq: 1, at: "2026-09-01", type: "filed", to: "mo_head", edited_at: null }] })]);
  for (const [id, parent] of TYPES.filter(([t]) => t !== "none")) {
    await open(page, "answer/#id=k3f9a2m8q1");
    await expect(page.locator("[data-case-line]")).toBeVisible();
    if (parent) {
      await page.locator("label.ok-big__item", { hasText: parent }).click();
      await page.locator(`input[name=reply][value=${id}]`).check();
    } else await page.locator(`.ok-big input[value=${id}]`).check();
    await page.getByRole("button", { name: "Записать ответ в дело" }).click();
    await expect(page.locator("[data-live]")).toContainText("Записано");
  }
  const c = (await storeDump(page)).find((e) => e.key === "case:k3f9a2m8q1").value;
  expect(c.events.length).toBe(13);
  expect(c.closed_at).toBe(isoShift(0));
});

test("журнал: исправить дату и удалить, сроки пересчитываются @xb", async ({ page }) => {
  await seedCases(page, [makeCase({ events: [{ seq: 1, at: "2026-05-01", type: "filed", to: "mo_head", edited_at: null }] })]);
  await open(page, "case/");
  await expect(page.locator("[data-primary]")).toContainText("Ответ не пришёл в срок");
  const before = await page.locator(".ok-due__date").innerText();
  await page.locator("[data-journal] li").first().getByRole("button", { name: "Исправить" }).click();
  await fillDate(page.locator("#ok-ev-at"), isoShift(-2));
  await page.locator("[data-event-dialog]").getByRole("button", { name: "Сохранить" }).click();
  await expect(page.locator("[data-primary]")).not.toContainText("Ответ не пришёл в срок");
  await expect(page.locator(".ok-due__date")).not.toHaveText(before);
  await expect(page.locator("[data-journal]")).toContainText("изменено");
  await page.locator("[data-journal] li").first().getByRole("button", { name: "Удалить" }).click();
  await page.locator("[data-confirm-yes]").click();
  await expect(page.locator(".ok-due__date")).toHaveCount(0);
  await expect(page.locator("[data-journal] li")).toHaveCount(0);
});

test("закрытое дело: «Удалить» у записи открывает дело снова, подача не появляется", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await seedCases(page, [makeCase({ scenario: "oral-refusal", events: [{ seq: 1, at: "2026-09-10", type: "oral_refusal", channel: "visit", edited_at: null }] })]);
  await open(page, "case/");
  await page.getByRole("button", { name: "Закрыть дело" }).click();
  const closed = page.locator("[data-journal] li", { hasText: "Дело закрыто" });
  await expect(closed).toBeVisible();
  await expect(closed.getByRole("button", { name: "Исправить" })).toHaveCount(0);
  for (const b of await page.locator(".ok-journal__actions .op-btn").all()) expect((await b.boundingBox()).height).toBeGreaterThanOrEqual(44);
  await expect(closed.getByRole("button", { name: "Удалить" })).toHaveClass(/op-btn--danger/);
  await checkA11y(page);
  await closed.getByRole("button", { name: "Удалить" }).click();
  await expect(page.locator("[data-confirm-text]")).toContainText("дело снова станет открытым");
  await page.locator("[data-confirm-yes]").click();
  await expect(page.locator("[data-journal]")).not.toContainText("Дело закрыто");
  await expect(page.locator("[data-journal]")).not.toContainText("Подали");
  await expect(page.locator("[data-close-case]")).toHaveText("Закрыть дело");
  const c = (await storeDump(page)).find((e) => e.key === "case:k3f9a2m8q1").value;
  expect(c.closed_at).toBeNull();
});

test("ответ «просьбу выполнили»: удаление записи снимает закрытие", async ({ page }) => {
  await seedCases(page, [makeCase({ closed_at: "2026-09-20", events: [
    { seq: 1, at: "2026-09-01", type: "filed", to: "mo_head", edited_at: null },
    { seq: 2, at: "2026-09-20", type: "reply", reply_type: "resolved", edited_at: null },
  ] })]);
  await open(page, "case/");
  await expect(page.locator("[data-due]")).toContainText("Дело закрыто");
  await page.locator("[data-journal] li", { hasText: "Пришёл ответ" }).getByRole("button", { name: "Удалить" }).click();
  await page.locator("[data-confirm-yes]").click();
  await expect(page.locator("[data-due]")).not.toContainText("Дело закрыто");
  const c = (await storeDump(page)).find((e) => e.key === "case:k3f9a2m8q1").value;
  expect(c.closed_at).toBeNull();
});

test("лист разговора: форма на первом экране телефона", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await open(page, "call/");
  const box = await page.locator("#ok-call-date-d").boundingBox();
  expect(box.y + box.height).toBeLessThanOrEqual(640);
});

test("лист разговора: одно дело выбирается сразу @xb", async ({ page }) => {
  await seedCases(page, [makeCase({ scenario: "oral-refusal" })]);
  await open(page, "call/");
  await page.fill("#ok-call-where", "Выездная паллиативная служба");
  await page.fill("#ok-call-said", "к вам не поедем");
  await expect(page.locator("[data-case-pick]")).toBeHidden();
  await page.getByRole("button", { name: "Добавить в дело" }).click();
  await expect(page.locator("[data-live]")).toContainText("Записано в дело «Отказали на словах»");
  await page.locator("[data-live] a").click();
  await expect(page.locator("[data-journal]")).toContainText("Звонили или ходили");
  await expect(page.locator("[data-journal]")).toContainText("Сказали: к вам не поедем");
});

test("лист разговора: при двух делах сначала выбор дела", async ({ page }) => {
  await seedCases(page, [makeCase({ id: "aaaaaaaaa1", scenario: "oral-refusal", created_at: "2026-09-01" }), makeCase({ id: "aaaaaaaaa2", scenario: "vk-refused", created_at: "2026-09-05" })]);
  await open(page, "call/");
  const pick = page.locator("[data-case-pick]");
  await expect(pick).toBeVisible();
  await expect(pick).toContainText("начато 05.09.2026");
  await expect(pick).not.toContainText("Иванов");
  await page.getByRole("button", { name: "Добавить в дело" }).click();
  await expect(page.locator("[data-live]")).toContainText("Выберите, в какое дело");
  await pick.locator("label", { hasText: "05.09.2026" }).click();
  await page.getByRole("button", { name: "Добавить в дело" }).click();
  await expect(page.locator("[data-live]")).toContainText("Записано в дело");
  const list = await storeDump(page);
  expect(list.find((e) => e.key === "case:aaaaaaaaa2").value.events.some((e) => e.type === "call")).toBe(true);
  expect(list.find((e) => e.key === "case:aaaaaaaaa1").value.events.some((e) => e.type === "call")).toBe(false);
});

test("HTML в полях выводится текстом: документ, дело, звонок, заметка @xb", async ({ page }) => {
  const dialogs = [];
  page.on("dialog", (d) => {
    dialogs.push(d.message());
    d.dismiss();
  });
  await seedCases(page, [makeCase({ scenario: "oral-refusal", events: [{ seq: 1, at: "2026-09-10", type: "oral_refusal", channel: "visit", edited_at: null }] })]);
  await open(page, "docs/written-answer/#id=k3f9a2m8q1");
  await fillDoc(page, { text: XSS });
  await page.getByRole("button", { name: /Дальше: проверить/ }).click();
  await expect(page.locator("[data-preview]")).toContainText(XSS);
  await page.getByRole("button", { name: "Всё верно" }).click();
  await page.getByRole("button", { name: /Отметить в деле/ }).click();

  await page.getByRole("button", { name: "Добавить событие" }).click();
  await page.selectOption("#ok-ev-type", "note");
  await page.fill("#ok-ev-note", XSS);
  await page.locator("[data-event-dialog]").getByRole("button", { name: "Сохранить" }).click();
  await expect(page.locator("[data-journal]")).toContainText(XSS);
  const addr = page.locator("[data-addressees] input").first();
  await addr.fill(XSS);
  await addr.blur();

  await open(page, "call/");
  for (const id of ["where", "who", "said", "asked"]) await page.fill(`#ok-call-${id}`, XSS);
  await page.getByRole("button", { name: "Добавить в дело" }).click();
  await page.locator("[data-live] a").click();
  await expect(page.locator("[data-journal]")).toContainText(`Куда: ${XSS}`);
  await expect(page.locator("[data-addressees] input").first()).toHaveValue(XSS);
  await expect(page.locator("img[src=x]")).toHaveCount(0);
  expect(dialogs).toEqual([]);
});

test("первый экран телефона 360x640: дело, документ, ответ", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  const inView = async (loc) => {
    const b = await loc.boundingBox();
    expect(b, "элемент на странице").not.toBeNull();
    expect(b.y + b.height, "низ элемента").toBeLessThanOrEqual(640);
  };
  await seedCases(page, [makeCase({ events: [{ seq: 1, at: "2026-05-01", type: "filed", to: "mo_head", edited_at: null }] })]);
  await open(page, "case/");
  await expect(page.locator("[data-primary] .op-status")).toBeVisible();
  await inView(page.locator("[data-primary] .op-status"));
  await inView(page.locator("[data-primary] a"));
  await seedCases(page, [makeCase({ events: [{ seq: 1, at: isoShift(-3), type: "filed", to: "mo_head", edited_at: null }] })]);
  await open(page, "case/");
  await expect(page.locator(".ok-due__date")).toBeVisible();
  await inView(page.locator(".ok-due__date"));
  await open(page, "docs/written-answer/");
  await expect(page.locator(".op-steps__count")).toBeVisible();
  await inView(page.locator("h1"));
  await inView(page.locator(".op-steps__count"));
  await open(page, "answer/");
  await expect(page.locator(".ok-big__item").first()).toBeVisible();
  await inView(page.locator(".ok-big__item").nth(3));
  await open(page, "case/");
  await page.evaluate(async () => (await import(new URL("../ui/js/store.js", location.href).href)).openStore("obrashchenie-kit").wipe());
  await open(page, "case/");
  await expect(page.locator("[data-view=empty]")).toBeVisible();
  await expect(page.locator(".op-draft")).toHaveCount(0);
});

test("просроченное дело: прошедшая дата, без календаря, номера региона с пометкой, имя минздрава без колл-центра", async ({ page }) => {
  await seedCases(page, [makeCase({ events: [{ seq: 1, at: "2026-05-01", type: "filed", to: "mo_head", edited_at: null }] })]);
  await open(page, "case/");
  await expect(page.locator(".ok-due__label")).toHaveText("Ответ должен был прийти до");
  await expect(page.locator("[data-case-ics]")).toBeHidden();
  const addr = page.locator("[data-addressees]");
  await expect(addr.locator("a[href^='tel:']").first()).toBeVisible();
  await expect(addr.locator(".ok-addr__src")).toContainText("звонком мы их не проверяли");
  await expect(addr.locator(".ok-addr__name").first()).toHaveText("Министерство здравоохранения Калининградской области");
  await open(page, "docs/deadline-complaint/#id=k3f9a2m8q1&to=minzdrav_region");
  await expect(page.locator("#f-addressee_name")).toHaveValue("Министерство здравоохранения Калининградской области");
});

test("дело закрыто ответом: в шагах нет следующего шага, хронология без лишнего срока", async ({ page }) => {
  await seedCases(page, [makeCase({ closed_at: "2026-08-20", events: [
    { seq: 1, at: "2026-08-01", type: "filed", to: "mo_head", edited_at: null },
    { seq: 2, at: "2026-08-20", type: "reply", reply_type: "resolved", edited_at: null },
  ] })]);
  await open(page, "case/");
  await expect(page.locator("[data-due]")).toContainText("Дело закрыто 20.08.2026");
  await expect(page.locator("[data-ladder] .is-current")).toHaveCount(0);
  await expect(page.locator("[data-ladder] li").last()).toContainText("Дело закрыто");
});
