import { test, expect, checkA11y } from "../../opsite/tests/fixtures.js";
import { open, isoShift } from "./helpers.js";

test("не ответили: вход из норм с правилом и датой, срок прошёл", async ({ page }) => {
  const from = isoShift(-45);
  await open(page, `case/#new=1&s=no-answer&rule=59fz-answer&from=${from}`);
  await expect(page.locator("[data-wizard-count]")).toHaveText("Шаг 2 из 4");
  expect(new URL(page.url()).hash).toBe("");
  await page.locator("input[name=role][value=self]").check();
  await page.getByRole("button", { name: "Дальше" }).click();
  await page.selectOption("#ok-region", "none");
  await page.getByRole("button", { name: "Дальше" }).click();
  await expect(page.locator("#ok-filed [data-part=y]")).toHaveValue(from.slice(0, 4));
  await page.getByRole("button", { name: /Готово/ }).click();
  await expect(page.locator(".op-status--deadline")).toContainText("Ответ не пришёл в срок");
  await expect(page.locator("[data-primary] a")).toHaveText("Собрать жалобу на нарушение срока");
  await expect(page.locator(".op-status--unverified").first()).toBeVisible();
  await checkA11y(page);
  await page.locator("[data-primary] a").click();
  await expect(page).toHaveURL(/docs\/deadline-complaint\/$/);
  await expect(page.locator("[data-field=filed_at] [data-part=y]")).toHaveValue(from.slice(0, 4));
});

test("будущая дата подачи даёт ошибку под полем", async ({ page }) => {
  await open(page, "case/#new=1&s=no-answer");
  await page.locator("input[name=role][value=self]").check();
  await page.getByRole("button", { name: "Дальше" }).click();
  await page.selectOption("#ok-region", { index: 1 });
  await page.getByRole("button", { name: "Дальше" }).click();
  const fs = page.locator("#ok-filed");
  const next = isoShift(30);
  await fs.locator("[data-part=d]").fill(String(Number(next.slice(8))));
  await fs.locator("[data-part=m]").selectOption(String(Number(next.slice(5, 7))));
  await fs.locator("[data-part=y]").fill(next.slice(0, 4));
  await page.getByRole("button", { name: /Готово/ }).click();
  await expect(fs.locator(".op-field__error")).toContainText("Дата не может быть позже сегодняшней");
});
