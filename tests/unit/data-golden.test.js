import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const read = (p) => JSON.parse(readFileSync(join(root, p), "utf8"));
const libPath = ["vendor/pal-norms/lib/deadlines.js", "tests/fixtures/vendor/pal-norms/lib/deadlines.js"]
  .map((p) => join(root, p))
  .find((p) => existsSync(p));
const { computeDeadline, isWorkingDay } = await import(pathToFileURL(libPath).href);
const golden = read("tests/golden/case-deadlines.json");
const calendar = read(golden.calendar);
const rules = Object.fromEntries(read(golden.rules).items.map((r) => [r.id, r]));

for (const c of golden.compute) {
  test(`срок ${c.id}: ${c.note}`, () => {
    const got = computeDeadline({ rule: rules[c.rule_id], start: c.start, calendar });
    for (const [k, v] of Object.entries(c.expect)) assert.deepEqual(got[k], v, `${c.id}.${k}`);
    assert.equal(typeof got.formula, "string");
    assert.ok(got.formula.length > 0);
  });
}

test("календарь по постановлениям о переносе выходных", () => {
  const off = ["2026-01-09", "2026-03-09", "2026-05-11", "2026-11-04", "2026-12-31", "2027-02-22", "2027-05-03",
    "2027-06-14", "2027-11-05", "2025-05-02", "2025-06-13", "2025-11-03"];
  const work = ["2027-02-20", "2025-11-01", "2026-11-05"];
  for (const d of off) assert.equal(isWorkingDay(d, calendar).working, false, d);
  for (const d of work) assert.equal(isWorkingDay(d, calendar).working, true, d);
});

test("2028 без утверждённого календаря не позже счёта только по выходным", () => {
  const got = computeDeadline({ rule: rules["208n-p23-transition"], start: "2028-03-01", calendar });
  let d = new Date("2028-03-01T00:00:00Z");
  for (let n = 0; n < 90;) {
    d = new Date(d.getTime() - 86400000);
    if (![0, 6].includes(d.getUTCDay())) n += 1;
  }
  assert.ok(got.due <= d.toISOString().slice(0, 10));
  assert.equal(got.calendar_verified, false);
});
