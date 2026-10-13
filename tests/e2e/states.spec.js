import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { test, expect } from "../../opsite/tests/fixtures.js";
import { open, fillDoc, fillDate, seedCases, makeCase, stubPrint, isoShift } from "./helpers.js";

const WIDTHS = [360, 390, 768, 1024, 1440];
const DIR = join(process.cwd(), "..", "_reports", "shots", "obrashchenie-kit");
const filed = (at) => ({ seq: 1, at, type: "filed", to: "mo_head", doc: "written-answer", channel: "paper-in-person", edited_at: null });
const CASES = {
  prepare: makeCase({ scenario: "oral-refusal", events: [{ seq: 1, at: "2026-09-10", type: "oral_refusal", channel: "phone", edited_at: null }] }),
  waiting: makeCase({ events: [filed(isoShift(-5))] }),
  overdue: makeCase({ events: [filed("2026-05-01")] }),
  answered: makeCase({ events: [filed("2026-08-01"), { seq: 2, at: "2026-08-20", type: "reply", reply_type: "explanation_only", edited_at: null }] }),
  closed: makeCase({ closed_at: "2026-08-20", events: [filed("2026-08-01"), { seq: 2, at: "2026-08-20", type: "reply", reply_type: "resolved", edited_at: null }] }),
};

async function snap(page, name) {
  mkdirSync(DIR, { recursive: true });
  for (const w of WIDTHS) {
    await page.setViewportSize({ width: w, height: w < 800 ? 800 : 900 });
    await page.waitForTimeout(80);
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(sw, `${name} ${w}: горизонтальная прокрутка`).toBeLessThanOrEqual(w);
    for (const theme of ["light", "dark"]) {
      await page.emulateMedia({ colorScheme: theme, media: "screen" });
      await page.waitForTimeout(40);
      await page.screenshot({ path: join(DIR, `${name}-${w}-${theme}.png`), fullPage: true });
    }
  }
  await page.emulateMedia({ colorScheme: "light", media: "screen" });
}

test.describe("состояния для просмотра @shots", () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== "desktop", "один проект"));

  test("мастер 1-4", async ({ page }) => {
    await open(page, "case/#new=1");
    await snap(page, "wizard-1");
    await page.locator("input[name=scenario][value=no-answer]").check();
    await page.getByRole("button", { name: "Дальше" }).click();
    await snap(page, "wizard-2");
    await page.locator("input[name=role][value=proxy]").check();
    await page.getByRole("button", { name: "Дальше" }).click();
    await snap(page, "wizard-3");
    await page.selectOption("#ok-region", "RU-KGD");
    await page.getByRole("button", { name: "Дальше" }).click();
    await snap(page, "wizard-4");
  });

  for (const [state, c] of Object.entries(CASES)) {
    test(`дело ${state}`, async ({ page }) => {
      await seedCases(page, [c]);
      await open(page, "case/");
      await expect(page.locator("[data-caseline]")).not.toHaveText("");
      await snap(page, `case-${state}`);
    });
  }

  test("пустое дело и лимит трёх дел", async ({ page }) => {
    await open(page, "case/");
    await expect(page.locator("[data-view=empty]")).toBeVisible();
    await snap(page, "case-empty");
    await seedCases(page, ["aaaaaaaaa1", "aaaaaaaaa2", "aaaaaaaaa3"].map((id) => makeCase({ id })));
    await open(page, "case/#new=1");
    await expect(page.locator("[data-view=limit]")).toBeVisible();
    await snap(page, "case-limit");
  });

  test("документ шаги 1-3 и печать двух экземпляров", async ({ page }) => {
    await seedCases(page, [CASES.prepare]);
    await open(page, "docs/written-answer/#id=k3f9a2m8q1");
    await page.locator(".ok-step[data-step='1']").waitFor();
    await snap(page, "doc-step-1");
    await fillDoc(page);
    await page.getByRole("button", { name: /Дальше: проверить/ }).click();
    await snap(page, "doc-step-2");
    await page.getByRole("button", { name: "Всё верно" }).click();
    await expect(page.locator("[data-ready]")).toContainText("Документ готов");
    await snap(page, "doc-step-3");
    await stubPrint(page);
    await page.locator("[data-print='2']").click();
    await page.setViewportSize({ width: 794, height: 1123 });
    await page.emulateMedia({ media: "print", colorScheme: "light" });
    await page.screenshot({ path: join(DIR, "doc-print-2-copies-a4.png"), fullPage: true });
    await page.pdf({ path: join(DIR, "doc-print-2-copies-a4.pdf"), format: "A4", preferCSSPageSize: true });
    await page.emulateMedia({ media: "screen" });
  });

  test("главная, сценарий, данные, хронология", async ({ page }) => {
    await open(page, "");
    await snap(page, "home");
    await open(page, "scenarios/oral-refusal/");
    await snap(page, "scenario-oral-refusal");
    await open(page, "data/");
    await snap(page, "data");
    await seedCases(page, [CASES.answered]);
    await open(page, "case/");
    await expect(page.locator("[data-caseline]")).not.toHaveText("");
    await stubPrint(page);
    await page.locator("[data-print-timeline]").click();
    await page.setViewportSize({ width: 794, height: 1123 });
    await page.emulateMedia({ media: "print", colorScheme: "light" });
    await page.screenshot({ path: join(DIR, "timeline-print-a4.png"), fullPage: true });
    await page.pdf({ path: join(DIR, "timeline-print-a4.pdf"), format: "A4", preferCSSPageSize: true });
    await page.emulateMedia({ media: "screen" });
  });

  test("лист разговора, 18 лет, ответ, 404", async ({ page }) => {
    await open(page, "call/");
    await snap(page, "call");
    await open(page, "turning-18/");
    await snap(page, "turning-18");
    await fillDate(page.locator("#ok-birth"), isoShift(-17 * 365));
    await page.getByRole("button", { name: /Посчитать/ }).click();
    await expect(page.locator("[data-result]")).toBeVisible();
    await snap(page, "turning-18-result");
    await open(page, "answer/");
    await snap(page, "answer");
    await open(page, "data/");
    await seedCases(page, [CASES.overdue]);
    await open(page, "answer/#id=k3f9a2m8q1");
    await expect(page.locator("[data-case-line]")).toBeVisible();
    await page.locator("input[name=reply][value=refusal]").first().check();
    await expect(page.locator("[data-result]")).toBeVisible();
    await snap(page, "answer-picked");
    await page.goto("nope/");
    await snap(page, "404");
  });
});
