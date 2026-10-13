import { readFileSync, writeFileSync } from "node:fs";
import { test, expect } from "../../opsite/tests/fixtures.js";
import { open } from "./helpers.js";

test.use({ serviceWorkers: "allow" });

test("после первого визита работает без интернета", async ({ page, context }) => {
  await open(page, "case/", { sw: true });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Моё дело");
  await expect(page.locator("[data-view=empty]")).toBeVisible();
  await page.goto("docs/written-answer/");
  await expect(page.locator("[data-step='1']")).toBeVisible();
  await page.goto("turning-18/");
  await expect(page.locator(".ok-t18__form")).toBeVisible();
  await context.setOffline(false);
});

test("новая версия показывает плашку Обновить", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "файл sw.js меняется на диске, проверяем в одном проекте");
  await open(page, "", { sw: true });
  const file = "_site/sw.js";
  const original = readFileSync(file, "utf8");
  try {
    writeFileSync(file, original.replace(/const VERSION = "([^"]+)"/, 'const VERSION = "$1-next"'));
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
    await expect(page.locator(".op-update")).toContainText("Вышла новая версия", { timeout: 20000 });
  } finally {
    writeFileSync(file, original);
  }
});
