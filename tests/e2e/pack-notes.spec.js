import { test, expect, checkA11y } from "../../opsite/tests/fixtures.js";
import { open, seedCases, makeCase, isoShift } from "./helpers.js";

const PRIVATE = "Если клиника частная, срок может быть другим";
const HINT = "министру здравоохранения вашего региона";

test("оговорка про частные клиники у срока главного врача: дело и сценарий @xb", async ({ page }) => {
  await seedCases(page, [makeCase({ events: [{ seq: 1, at: isoShift(-3), type: "filed", to: "mo_head", edited_at: null }] })]);
  await open(page, "case/");
  await expect(page.locator("[data-due]")).toContainText(PRIVATE);
  await open(page, "scenarios/oral-refusal/");
  await expect(page.locator(".ok-rules")).toContainText(PRIVATE);
});

test("оговорки нет, когда жалоба ушла в Росздравнадзор", async ({ page }) => {
  await seedCases(page, [makeCase({ events: [{ seq: 1, at: isoShift(-3), type: "filed", to: "rzn_to", doc: "deadline-complaint", edited_at: null }] })]);
  await open(page, "case/");
  await expect(page.locator(".ok-due__date")).toBeVisible();
  await expect(page.locator("[data-due]")).not.toContainText(PRIVATE);
});

for (const id of ["deadline-complaint", "repeat-complaint"]) {
  test(`подсказка адресата в ${id} называет вышестоящие ведомства`, async ({ page }) => {
    await open(page, `docs/${id}/`);
    const field = page.locator("[data-field=addressee_name]");
    await expect(field).toContainText(HINT);
    await expect(field).not.toContainText("главному врачу");
  });
}

test("запрос медицинских документов: опекун указывает свой паспорт и адрес", async ({ page }) => {
  await open(page, "docs/med-records/");
  await expect(page.locator("[data-field=applicant_id_doc]")).toBeHidden();
  await page.locator("input[name=role][value=guardian]").check();
  await expect(page.locator("[data-field=applicant_id_doc]")).toBeVisible();
  await expect(page.locator("[data-field=applicant_residence]")).toBeVisible();
  await expect(page.locator(".ok-step[data-step='1']")).toContainText("Что должно быть в запросе, сказано в пункте 2");
  await checkA11y(page);
});

test("/data/: у каждой непроверенной строки причина, регионы без Росздравнадзора названы", async ({ page }) => {
  await open(page, "data/");
  const items = page.locator(".ok-unv li");
  const n = await items.count();
  expect(n).toBeGreaterThan(5);
  for (let i = 0; i < n; i++) await expect(items.nth(i).locator(".ok-unv__why")).not.toBeEmpty();
  await expect(page.locator(".ok-unv")).toContainText("Территориального органа Росздравнадзора нет в данных РЗН: Москва, Московская область");
});
