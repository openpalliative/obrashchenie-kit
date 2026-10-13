const TZ = "Europe/Moscow";

export function isoShift(days, base = new Date()) {
  const [y, m, d] = base.toLocaleDateString("en-CA", { timeZone: TZ }).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) + days * 86400000).toISOString().slice(0, 10);
}

export async function open(page, path, { sw = false } = {}) {
  await page.goto(path);
  if (!sw) return;
  await page.waitForFunction(() => navigator.serviceWorker?.controller, null, { timeout: 20000 });
  await page.waitForTimeout(400);
  await page.goto(path);
  await page.waitForLoadState("load");
}

export async function fillDate(scope, iso) {
  const [y, m, d] = iso.split("-");
  await scope.locator("[data-part=d]").fill(String(Number(d)));
  await scope.locator("[data-part=m]").selectOption(String(Number(m)));
  await scope.locator("[data-part=y]").fill(y);
}

export async function newCase(page, { scenario = "oral-refusal", role = "self" } = {}) {
  await open(page, `case/#new=1&s=${scenario}`);
  await page.locator(`input[name=role][value=${role}]`).check();
  await page.getByRole("button", { name: "Дальше" }).click();
  await page.selectOption("#ok-region", { index: 1 });
  await page.getByRole("button", { name: "Дальше" }).click();
  await page.locator("[data-for]:not([hidden]) [data-quick='0']").first().click();
  await page.getByRole("button", { name: /Готово/ }).click();
  await page.locator("[data-view=case]").waitFor();
}

export async function stubPrint(page) {
  await page.evaluate(() => { window.print = () => {}; });
}

export function pdfCount(buf) {
  return (buf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length;
}

export function makeCase(patch = {}) {
  return {
    id: "k3f9a2m8q1", schema: 1, created_at: "2026-05-01", closed_at: null, scenario: "no-answer", role: "self",
    region_id: "RU-KGD", respondent_level: 1, device: null, nut: null, pack_version: null, addressees: {}, docs: {}, events: [], last_due: null,
    ...patch,
  };
}

export async function seedCases(page, list, { profile = null } = {}) {
  if (!page.url().includes("/obrashchenie-kit/")) await page.goto("data/");
  await page.evaluate(async ({ list, profile }) => {
    const { openStore } = await import(new URL("ui/js/store.js", document.baseURI.replace(/obrashchenie-kit\/.*$/, "obrashchenie-kit/")).href);
    const s = openStore("obrashchenie-kit");
    for (const c of list) await s.set(`case:${c.id}`, c);
    if (profile) await s.set("profile", profile);
  }, { list, profile });
}

export async function storeDump(page) {
  return page.evaluate(async () => {
    const { openStore } = await import(new URL("ui/js/store.js", document.baseURI.replace(/obrashchenie-kit\/.*$/, "obrashchenie-kit/")).href);
    return openStore("obrashchenie-kit").list();
  });
}

export async function fillDoc(page, { text = "Пример", date = "2026-09-01" } = {}) {
  await page.locator(".ok-step[data-step='1']").waitFor();
  const wraps = page.locator(".ok-step[data-step='1'] [data-field]:visible");
  const n = await wraps.count();
  for (let i = 0; i < n; i++) {
    const w = wraps.nth(i);
    const type = await w.getAttribute("data-type");
    const id = await w.getAttribute("data-field");
    if (type === "date") {
      if (id === "signed_at") continue;
      await fillDate(w.locator("[data-date3]"), date);
    } else if (type === "select") {
      await w.locator("select").selectOption({ index: 1 });
    } else {
      const input = w.locator("input, textarea").first();
      if (!(await input.inputValue())) await input.fill(`${text} ${id}`);
    }
  }
}
