import { test, expect } from "../../opsite/tests/fixtures.js";
import { open } from "./helpers.js";

test("чужие параметры отбрасываются молча, ФИО в адрес не попадает", async ({ page }) => {
  await open(page, "case/#s=evil&region=RU-XXX&name=Сидорчук");
  await expect(page.locator("[data-view=empty]")).toBeVisible();
  await expect.poll(() => new URL(page.url()).hash).toBe("");
  await expect(page.locator("main")).not.toContainText("Сидорчук");
});

test("неизвестный сценарий в мастере не выбран", async ({ page }) => {
  await open(page, "case/#new=1&s=evil&region=RU-XXX");
  await expect(page.locator("[data-wizard-count]")).toHaveText("Шаг 1 из 4");
  await expect(page.locator("input[name=scenario]:checked")).toHaveCount(0);
  await expect(page.locator("#ok-region")).toHaveValue("");
});

test("дело с #back показывает ссылку обратно к ситуации", async ({ page }) => {
  await open(page, "case/#new=1&s=oral-refusal&back=conclusion");
  await expect(page.locator("input[name=scenario][value=oral-refusal]")).toBeChecked();
  await expect.poll(() => new URL(page.url()).hash).toBe("");
  const back = page.locator("[data-back] a");
  await expect(back).toBeVisible();
  await expect(back).toHaveAttribute("href", /\/s\/conclusion\/$/);
  await expect(back).toContainText("Вернуться: ");
});
