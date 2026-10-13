import { test, expect } from "../../opsite/tests/fixtures.js";
import { open, fillDate, fillDoc, seedCases, makeCase, stubPrint } from "./helpers.js";

async function fileThroughDoc(page) {
  await fillDoc(page);
  await page.getByRole("button", { name: /Дальше: проверить/ }).click();
  await page.getByRole("button", { name: "Всё верно" }).click();
  await expect(page.locator("[data-ready]")).toContainText("Документ готов");
  await page.getByRole("button", { name: /Отметить в деле/ }).click();
  await expect(page).toHaveURL(/case\/$/);
}

test("лестница поднимается после второй подачи @xb", async ({ page }) => {
  await open(page, "case/#new=1&s=no-answer");
  await page.locator("input[name=role][value=self]").check();
  await page.getByRole("button", { name: "Дальше" }).click();
  await page.selectOption("#ok-region", "RU-KGD");
  await page.getByRole("button", { name: "Дальше" }).click();
  await fillDate(page.locator("#ok-filed"), "2026-05-01");
  await page.getByRole("button", { name: /Готово/ }).click();

  const primary = page.locator("[data-primary] a");
  await expect(primary).toHaveText("Собрать жалобу на нарушение срока");
  await expect(page.locator("[data-primary]")).toContainText("Росздравнадзор региона");
  await primary.click();
  await expect(page).toHaveURL(/docs\/deadline-complaint\/$/);
  await expect(page.locator("#f-addressee_name")).toHaveValue(/Росздравнадзор/);
  await fileThroughDoc(page);
  await expect(page.locator("[data-journal]")).toContainText("Куда: Росздравнадзор региона");
  await expect(page.locator(".ok-due__date")).toBeVisible();

  const second = page.locator("[data-journal] li", { hasText: "Куда: Росздравнадзор региона" });
  await second.getByRole("button", { name: "Исправить" }).click();
  await fillDate(page.locator("#ok-ev-at"), "2026-07-01");
  await page.locator("[data-event-dialog]").getByRole("button", { name: "Сохранить" }).click();

  await expect(primary).toHaveText("Собрать жалобу на нарушение срока");
  const status = await page.locator("[data-primary] .op-status").innerText();
  expect(status).not.toMatch(/региона/);
  await expect(primary).toHaveAttribute("href", /to=(rzn_central|minzdrav_rf|prosecutor)/);
  const opts = await page.locator("[data-optlist] .ok-opt__label").allInnerTexts();
  expect(opts.length).toBeGreaterThan(0);
  for (const o of opts) expect(o).not.toMatch(/региона/);
});

test("вариант «Минздрав России» открывает жалобу с этим адресатом и пишет его в журнал", async ({ page }) => {
  await seedCases(page, [makeCase({ events: [
    { seq: 1, at: "2026-05-01", type: "filed", to: "mo_head", edited_at: null },
    { seq: 2, at: "2026-07-01", type: "filed", doc: "deadline-complaint", to: "rzn_to", edited_at: null },
  ] })]);
  await open(page, "case/");
  const opt = page.locator("[data-optlist] li", { hasText: "Минздрав России" });
  await opt.getByRole("link", { name: "Собрать документ" }).click();
  await expect(page).toHaveURL(/docs\/deadline-complaint\/$/);
  await expect(page.locator("#f-addressee_name")).toHaveValue(/.{4,}/);
  const to = await page.locator("#f-addressee_name").inputValue();
  expect(to).not.toContain("Территориальный орган Росздравнадзора");
  expect(to.length).toBeGreaterThan(3);
  await fillDoc(page);
  await page.getByRole("button", { name: /Дальше: проверить/ }).click();
  await page.getByRole("button", { name: "Всё верно" }).click();
  await page.locator("label.op-choice__item", { hasText: "заказным письмом" }).first().click();
  await page.getByRole("button", { name: /Отметить в деле/ }).click();
  const row = page.locator("[data-journal] li").last();
  await expect(row).toContainText("Куда: Минздрав России");
  await expect(row).toContainText(/Как подали: .*письм/i);
});

test("Москва: без Росздравнадзора региона следующий адресат - минздрав региона", async ({ page }) => {
  await seedCases(page, [makeCase({ region_id: "RU-MOW", events: [{ seq: 1, at: "2026-05-01", type: "filed", to: "mo_head", edited_at: null }] })]);
  await open(page, "case/");
  const prim = page.locator("[data-primary]");
  await expect(prim).toContainText("Собрать жалобу на нарушение срока");
  await expect(prim).not.toContainText("Росздравнадзор");
  await expect(page.locator("[data-addressees]")).toContainText("Территориального органа Росздравнадзора в нашем списке для этого региона нет");
  await expect(page.locator("[data-addressees] a", { hasText: "Страница региона" })).toHaveAttribute("href", /regions\/ru-mow\//);
  await prim.locator("a").click();
  await expect(page.locator("#f-addressee_name")).toHaveValue(/здравоохранения/i);
});

test("изделие и питание в строке дела, просьба предзаполнена", async ({ page }) => {
  await open(page, "case/#new=1&s=oral-refusal&device=303260&nut=0001202312110027");
  await page.locator("input[name=role][value=self]").check();
  await page.getByRole("button", { name: "Дальше" }).click();
  await page.selectOption("#ok-region", "RU-KGD");
  await page.getByRole("button", { name: "Дальше" }).click();
  await page.locator("[data-for]:not([hidden]) [data-quick='0']").first().click();
  await page.getByRole("button", { name: /Готово/ }).click();
  const line = page.locator("[data-caseline]");
  await expect(line.locator("a", { hasText: "изделие с кодом 303260" })).toHaveAttribute("href", /pal-devices-data\/devices\/303260\/$/);
  await expect(line.locator("a", { hasText: "лечебное питание" })).toHaveAttribute("href", /pal-devices-data\/nutrition\/0001202312110027\/$/);
  await page.locator("[data-primary] a").click();
  await expect(page.locator("#f-request")).toHaveValue("выдать медицинское изделие (код вида 303260)");
  await page.fill("#f-request", "выдать медицинское изделие (код вида 303260) в течение месяца");
  await expect(page.locator("#f-request")).toHaveValue(/в течение месяца/);
});

test("дата ответа: вчера записывается в журнал, раньше подачи нельзя", async ({ page }) => {
  const y = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  await seedCases(page, [makeCase({ events: [{ seq: 1, at: "2026-09-20", type: "filed", to: "mo_head", edited_at: null }] })]);
  await open(page, "answer/#id=k3f9a2m8q1");
  await page.locator("label.ok-big__item", { hasText: "Отказали" }).click();
  await fillDate(page.locator("#ok-ans-at"), "2026-09-01");
  await page.getByRole("button", { name: "Записать ответ в дело" }).click();
  await expect(page.locator("#ok-ans-at")).toContainText("раньше, чем вы подали");
  await fillDate(page.locator("#ok-ans-at"), y);
  await page.getByRole("button", { name: "Записать ответ в дело" }).click();
  await expect(page.locator("[data-live]")).toContainText("Записано в дело");
  await page.locator("[data-live] a").click();
  const [yy, mm, dd] = y.split("-");
  await expect(page.locator("[data-journal] li", { hasText: "Пришёл ответ" })).toContainText(`${dd}.${mm}.${yy}`);
});

test("браузер не обещает хранить: одно напоминание сохранить файл", async ({ page }) => {
  await page.addInitScript(() => {
    if (navigator.storage) {
      navigator.storage.persist = async () => false;
      navigator.storage.persisted = async () => false;
    }
  });
  await seedCases(page, [makeCase()]);
  await open(page, "case/");
  const box = page.locator("[data-persist]");
  await expect(box).toContainText("Браузер может удалить дела, если на устройстве мало места");
  await expect(box.getByRole("button", { name: "Сохранить файл дела" })).toBeVisible();
  await page.reload();
  await expect(page.locator("[data-caseline]")).not.toHaveText("");
  await expect(page.locator("[data-persist]")).toBeHidden();
});

test("печать хронологии: один лист A4 со всеми датами @print", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "PDF только в chromium");
  await seedCases(page, [makeCase({
    docs: { "written-answer": { fields: { request: "созвать комиссию" }, built_at: "2026-04-28" } },
    events: [
      { seq: 1, at: "2026-04-20", type: "oral_refusal", channel: "phone", edited_at: null },
      { seq: 2, at: "2026-04-28", type: "filed", doc: "written-answer", to: "mo_head", channel: "paper-in-person", reg_number: "123-А", edited_at: null },
      { seq: 3, at: "2026-04-30", type: "registered", reg_number: "123-А", edited_at: null },
      { seq: 4, at: "2026-05-15", type: "call", note: "Сказали ждать", edited_at: null },
      { seq: 5, at: "2026-06-10", type: "note", note: "Позвонили ещё раз", edited_at: null },
    ],
  })]);
  await open(page, "case/");
  await stubPrint(page);
  await page.getByRole("button", { name: "Распечатать хронологию" }).click();
  await page.emulateMedia({ media: "print" });
  const tl = page.locator(".ok-tl");
  await expect(tl).toBeVisible();
  await expect(tl).toContainText("Хронология обращения");
  await expect(tl).toContainText(/Распечатано/);
  for (const d of ["20.04.2026", "28.04.2026", "30.04.2026", "15.05.2026", "10.06.2026"]) await expect(tl).toContainText(d);
  await expect(tl).toContainText("123-А");
  await expect(tl).toContainText("собран 28.04.2026");
  await expect(tl).toContainText("Не проверено");
  await expect(tl).toContainText("Черновик");
  await expect(tl).not.toContainText("Заявитель:");
  await expect(page.getByText("Даты можно исправить")).toBeHidden();
  await expect(page.locator("[data-print-timeline]")).toBeHidden();
  const buf = await page.pdf({ format: "A4", preferCSSPageSize: true });
  expect((buf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length).toBe(1);
  await page.emulateMedia({ media: "screen" });
});
