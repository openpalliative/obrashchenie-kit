import { test, expect, checkA11y, pdfPages } from "../../opsite/tests/fixtures.js";
import { open, fillDate } from "./helpers.js";

test("ребёнку скоро 18: даты, печать, календарь", async ({ page }) => {
  await open(page, "turning-18/");
  const now = new Date();
  const birth = `${now.getFullYear() - 17}-06-15`;
  await fillDate(page.locator("#ok-birth"), birth);
  await page.getByRole("button", { name: "Посчитать" }).click();
  const list = page.locator("[data-list] li");
  await expect(list).toHaveCount(4);
  await expect(page.locator("[data-list]")).toContainText("Ориентир, не норма");
  await expect(page.locator("[data-for-line]")).toContainText(`${now.getFullYear() + 1}`);
  await checkA11y(page);
  expect(await pdfPages(page)).toBe(1);
  const [ics] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Добавить в календарь" }).click()]);
  expect(ics.suggestedFilename()).toBe("18-let.ics");
});

test("уже исполнилось 18: понятная ошибка", async ({ page }) => {
  await open(page, "turning-18/");
  await fillDate(page.locator("#ok-birth"), "2000-01-01");
  await page.getByRole("button", { name: "Посчитать" }).click();
  await expect(page.locator("#ok-birth .op-field__error")).toContainText("уже исполнилось 18");
});

for (const birth of ["2011-01-03", "2008-12-31"]) {
  test(`печать на 1 лист и со статусами календаря: ${birth}`, async ({ page }) => {
    await open(page, "turning-18/");
    await fillDate(page.locator("#ok-birth"), birth);
    await page.getByRole("button", { name: "Посчитать" }).click();
    await expect(page.locator("[data-list] li")).toHaveCount(4);
    expect(await pdfPages(page)).toBe(1);
  });
}
