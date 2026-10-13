import { test, expect } from "@playwright/test";
import { open, seedCases } from "./helpers.js";

test("при сбое данных форма документа не открывается, адрес без ?", async ({ page }) => {
  await page.route("**/data/v1/documents.json", (r) => r.fulfill({ status: 500, body: "" }));
  const errors = [];
  page.on("pageerror", (e) => errors.push(e));
  await open(page, "docs/written-answer/");
  await expect(page.locator(".ok-page-error")).toContainText("Страница не открылась. Обновите её. Данные на устройстве не удалены");
  await expect(page.locator(".ok-step[data-step='1']")).toBeHidden();
  await expect(page.locator("#f-applicant_name")).toBeHidden();
  await page.keyboard.press("Enter");
  expect(page.url()).not.toContain("?");
  expect(errors).toEqual([]);
});

test("испорченная роль в профиле: страница открывается с ролью «сам пациент»", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e));
  await seedCases(page, [], { profile: { role: "x\"]", applicant_name: "Иванова" } });
  await open(page, "docs/written-answer/");
  await expect(page.locator("input[name=role][value=self]")).toBeChecked();
  await expect(page.locator("#f-applicant_name")).toHaveValue("Иванова");
  expect(errors).toEqual([]);
});
