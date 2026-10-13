import { readFileSync } from "node:fs";
import { test, expect } from "../../opsite/tests/fixtures.js";
import { newCase } from "./helpers.js";

test("экспорт, удаление всего и импорт дела", async ({ page }) => {
  await newCase(page);
  await expect(page.locator("[data-caseline]")).not.toHaveText("");
  const caseline = await page.locator("[data-caseline]").innerText();
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Сохранить файлом" }).click()]);
  expect(dl.suggestedFilename()).toMatch(/^dela-\d{4}-\d{2}-\d{2}\.json$/);
  const file = await dl.path();
  const data = JSON.parse(readFileSync(file, "utf8"));
  expect(data.repo).toBe("obrashchenie-kit");

  await page.getByRole("button", { name: "Удалить всё с этого устройства" }).click();
  await page.locator("[data-confirm-yes]").click();
  await page.waitForLoadState("load");
  await expect(page.locator("[data-view=empty]")).toBeVisible();

  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.getByRole("button", { name: "Открыть файл" }).click()]);
  await chooser.setFiles(file);
  await expect(page.locator("[data-file-live]")).toHaveText("Дела из файла открыты");
  await expect(page.locator("[data-caseline]")).toHaveText(caseline);
});

test("чужой файл даёт русскую ошибку", async ({ page }) => {
  await newCase(page);
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.getByRole("button", { name: "Открыть файл" }).click()]);
  await chooser.setFiles("tests/fixtures/backups/wrong-repo.json");
  await expect(page.locator("[data-file-live]")).toContainText("Файл не подошёл");
});
