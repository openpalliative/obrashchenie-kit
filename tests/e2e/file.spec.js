import { readFileSync } from "node:fs";
import { test, expect } from "../../opsite/tests/fixtures.js";
import { open, newCase, seedCases, makeCase, storeDump, fillDoc } from "./helpers.js";

const DOCS = ["written-answer", "vk-extract", "med-records", "deadline-complaint", "repeat-complaint", "filing-sheet"];

async function importFile(page, path) {
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.getByRole("button", { name: "Открыть файл" }).click()]);
  await chooser.setFiles(path);
}

for (const name of ["bad-role", "region-number", "docs-null", "addressees-string", "profile-junk"]) {
  test(`файл ${name}: понятный итог, страницы открываются без ошибок`, async ({ page }) => {
    await open(page, "case/");
    await expect(page.locator("[data-view=empty]")).toBeVisible();
    await importFile(page, `tests/fixtures/backups/${name}.json`);
    const live = page.locator("[data-file-live]");
    if (name === "profile-junk") {
      await page.locator("[data-confirm-yes]").click();
      await expect(live).toHaveText("Дела из файла открыты");
      const profile = (await storeDump(page)).find((e) => e.key === "profile")?.value;
      expect(profile).toEqual({ applicant_name: "Иванова Мария Петровна (пример)" });
    } else {
      await expect(live).toContainText("повреждён");
      expect((await storeDump(page)).length).toBe(0);
    }
    await open(page, "case/");
    for (const d of DOCS) {
      await open(page, `docs/${d}/`);
      await expect(page.locator(".ok-step[data-step='1']")).toBeVisible();
    }
  });
}

test("файл с данными: ответ «Нет» не запоминает профиль и личные поля", async ({ page }) => {
  await open(page, "case/");
  await importFile(page, "tests/fixtures/backups/good.json");
  await expect(page.locator("[data-confirm-text]")).toHaveText("В файле есть ваши данные (ФИО, адрес). Запомнить их на этом устройстве?");
  await page.locator("[data-confirm-no]").click();
  await expect(page.locator("[data-file-live]")).toHaveText("Дела из файла открыты");
  const profile = await page.evaluate(async () => (await import(new URL("../assets/js/ok-store.js", location.href).href)).getProfile());
  expect(profile).toBeNull();
  expect((await storeDump(page)).some((e) => e.key === "profile")).toBe(false);
});

test("повреждённое дело на устройстве скрыто, есть плашка и удаление", async ({ page }) => {
  await seedCases(page, [makeCase(), { ...makeCase({ id: "zzzzzzzzz1" }), role: "x\"]" }]);
  await open(page, "case/");
  await expect(page.locator("[data-damaged]")).toContainText("Одно дело повреждено");
  await expect(page.locator("[data-caseline]")).toContainText("Не ответили в срок");
  await page.getByRole("button", { name: "Удалить повреждённое дело" }).click();
  await page.locator("[data-confirm-yes]").click();
  await expect(page.locator("[data-damaged]")).toBeHidden();
  expect((await storeDump(page)).map((e) => e.key).filter((k) => k.startsWith("case:"))).toEqual(["case:k3f9a2m8q1"]);
});

test("файл не зашифрован: предупреждение у кнопки и напоминание после удаления @xb", async ({ page }) => {
  await newCase(page);
  const warn = page.locator(".ok-file .ok-warn");
  await expect(warn).toHaveText("Файл не зашифрован. В нём могут быть ваши данные и данные паспорта. Храните его как документы и не пересылайте в общие чаты");
  await expect(warn.locator("svg use")).toHaveAttribute("href", /triangle-alert/);
  await page.evaluate(() => localStorage.setItem("ok:test", "1"));
  await page.getByRole("button", { name: "Удалить всё с этого устройства" }).click();
  await page.locator("[data-confirm-yes]").click();
  await expect(page.locator("[data-file-live]")).toContainText("остались в папке загрузок");
  await expect(page.locator("[data-view=empty]")).toBeVisible();
  expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("ok:")))).toEqual([]);
  expect(await storeDump(page)).toEqual([]);
});

test("экспорт без галочки не содержит профиля", async ({ page }) => {
  await newCase(page);
  await page.locator("[data-primary] a").click();
  await fillDoc(page);
  await page.getByRole("button", { name: /Дальше: проверить/ }).click();
  await page.getByRole("button", { name: "Всё верно" }).click();
  await expect(page.locator("[data-ready]")).toContainText("Документ готов");
  await open(page, "case/");
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Сохранить файлом" }).click()]);
  const data = JSON.parse(readFileSync(await dl.path(), "utf8"));
  expect(data.entries.map((e) => e.key).filter((k) => k === "profile")).toEqual([]);
  const fields = data.entries.find((e) => e.key.startsWith("case:")).value.docs["written-answer"].fields;
  expect(fields.applicant_name).toBeUndefined();
  expect(fields.request).toBeTruthy();
});

test("четвёртое дело не начинается, понятное объяснение @xb", async ({ page }) => {
  await seedCases(page, ["aaaaaaaaa1", "aaaaaaaaa2", "aaaaaaaaa3"].map((id) => makeCase({ id })));
  await open(page, "case/#new=1&s=oral-refusal");
  await expect(page.locator("[data-view=limit]")).toBeVisible();
  await expect(page.locator("[data-view=limit]")).toContainText("Дел уже три");
  await page.getByRole("button", { name: "Открыть мои дела" }).click();
  await expect(page.locator("[data-switch]")).toBeVisible();
});
