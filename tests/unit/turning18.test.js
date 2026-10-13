import { test } from "node:test";
import assert from "node:assert/strict";
import { turning18, birthday18 } from "../../lib/turning18.js";
import { addWorkingDays } from "../../lib/workdays.js";
import { readJson, kitItems, deadlines } from "./helpers.js";

const golden = readJson("tests/golden/turning18.json");
const calendar = readJson(golden.calendar);
const rules = readJson(golden.rules).items;
const items = kitItems("turning18");

for (const c of golden.cases) {
  test(`18 лет: ${c.note}`, () => {
    const rows = Object.fromEntries(turning18(c.birth, { items, rules, calendar, computeDeadline: deadlines.computeDeadline }).map((r) => [r.id, r]));
    for (const [id, exp] of Object.entries(c.expect)) {
      for (const [k, v] of Object.entries(exp)) assert.equal(rows[id][k], v, `${c.birth} ${id}.${k}`);
    }
  });
}

test("ориентиры семей помечены как непроверенные", () => {
  const rows = turning18("2009-05-12", { items, rules, calendar, computeDeadline: deadlines.computeDeadline });
  for (const r of rows.filter((x) => x.kind === "family_orientir")) assert.equal(r.verified, false);
});

test("29 февраля: 18 лет считаем с 1 марта", () => {
  assert.equal(birthday18("2008-02-29"), "2026-03-01");
});

test("без правила в снимке даты нет, а не выдуманная", () => {
  const rows = turning18("2009-05-12", { items, rules: [], calendar, computeDeadline: deadlines.computeDeadline });
  const p23 = rows.find((r) => r.id === "p23-extract");
  assert.equal(p23.rule_missing, true);
  assert.equal(p23.date, null);
});

test("свой счёт рабочих дней совпадает со снимком норм на утверждённом календаре", () => {
  const rule = rules.find((r) => r.id === "208n-p23-transition");
  const own = addWorkingDays("2027-05-12", -rule.value, calendar).date;
  assert.equal(own, deadlines.computeDeadline({ rule, start: "2027-05-12", calendar }).due);
});

test("формула п. 23 говорит про 18-летие и запас, а не про событие", () => {
  const p23 = turning18("2009-05-09", { items, rules, calendar, computeDeadline: deadlines.computeDeadline }).find((r) => r.id === "p23-extract");
  assert.equal(p23.formula, "За 90 рабочих дней до дня, когда исполнится 18, по производственному календарю. Запас 5 рабочих дней");
});
