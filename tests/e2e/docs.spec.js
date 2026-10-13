import { test, expect, checkA11y, noHorizontalScroll } from "../../opsite/tests/fixtures.js";
import { open, fillDoc, seedCases, makeCase, stubPrint, pdfCount } from "./helpers.js";

const DOCS = ["written-answer", "vk-extract", "med-records", "deadline-complaint", "repeat-complaint", "filing-sheet"];

for (const id of DOCS) {
  test(`документ ${id}: заполнить, проверить, печать, PDF, Госуслуги, отметка о подаче @xb`, async ({ page }, info) => {
    const chromium = info.project.use.browserName === "chromium" || !info.project.use.browserName;
    await seedCases(page, [makeCase({ scenario: "oral-refusal", events: [{ seq: 1, at: "2026-09-10", type: "oral_refusal", channel: "visit", edited_at: null }] })]);
    await open(page, `docs/${id}/#id=k3f9a2m8q1`);
    await expect(page.locator(".op-steps__count")).toHaveText("Шаг 1 из 3");
    await fillDoc(page);
    await page.getByRole("button", { name: /Дальше: проверить/ }).click();
    await expect(page.locator(".op-steps__count")).toHaveText("Шаг 2 из 3");
    await expect(page.locator("[data-preview] .ok-sheet")).toBeVisible();
    await noHorizontalScroll(page);
    await page.getByRole("button", { name: "Всё верно" }).click();
    await expect(page.locator(".op-steps__count")).toHaveText("Шаг 3 из 3");
    await expect(page.locator("[data-ready]")).toContainText("Документ готов");

    const two = page.locator("[data-print='2']");
    const label = await two.innerText();
    const pages = Number(/(\d+) страниц/.exec(label)?.[1]);
    expect(pages).toBeGreaterThanOrEqual(2);
    await stubPrint(page);
    await two.click();
    await expect(page.locator("[data-sheets] .ok-sheet")).toHaveCount(2);
    if (chromium) expect(pdfCount(await page.pdf({ format: "A4", preferCSSPageSize: true }))).toBe(pages);
    await page.evaluate(() => dispatchEvent(new Event("afterprint")));

    const one = page.locator("[data-print='1']");
    const onePages = Number(/(\d+) страниц/.exec(await one.innerText())?.[1]);
    await one.click();
    await expect(page.locator("[data-sheets] .ok-sheet")).toHaveCount(1);
    if (chromium) expect(pdfCount(await page.pdf({ format: "A4", preferCSSPageSize: true }))).toBe(onePages);
    await page.evaluate(() => dispatchEvent(new Event("afterprint")));

    const esia = page.locator(".ok-esia");
    if (await esia.count()) {
      await esia.locator("summary").click();
      await expect(page.locator("[data-esia]")).not.toHaveValue("");
      await expect(page.locator("[data-esia-count]")).toContainText(/\d+ знак/);
    }
    await checkA11y(page);
    await page.getByRole("button", { name: /Отметить в деле/ }).click();
    await expect(page).toHaveURL(/case\/$/);
    await expect(page.locator("[data-journal]")).toContainText("Подали");
  });
}
