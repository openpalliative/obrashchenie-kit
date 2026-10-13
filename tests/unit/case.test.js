import { test } from "node:test";
import assert from "node:assert/strict";
import { reduceCase } from "../../lib/case.js";
import { buildSteps, eventLabel } from "../../lib/case-view.js";
import { readJson, kitItems, deadlines } from "./helpers.js";

const golden = readJson("tests/golden/case-deadlines.json");
const calendar = readJson(golden.calendar);
const rules = readJson(golden.rules).items;
const replyTypes = kitItems("reply-types");

for (const c of golden.cases) {
  test(`дело ${c.id}: ${c.note}`, () => {
    const st = reduceCase(c.case, { rules, calendar, computeDeadline: deadlines.computeDeadline, today: c.today, replyTypes });
    assert.equal(st.stage, c.expect.stage);
    if (c.expect.conditions) assert.deepEqual(st.conditions, c.expect.conditions);
    if (c.expect.deadlines) {
      assert.equal(st.deadlines.length, c.expect.deadlines.length);
      c.expect.deadlines.forEach((exp, i) => {
        for (const [k, v] of Object.entries(exp)) assert.deepEqual(st.deadlines[i][k], v, `${c.id}.${k}`);
      });
    }
  });
}

test("срок прошёл: главный шаг - жалоба на нарушение срока", () => {
  const c = golden.cases.find((x) => x.expect.stage === "overdue");
  const st = reduceCase(c.case, { rules, calendar, computeDeadline: deadlines.computeDeadline, today: c.today, replyTypes });
  assert.equal(st.next.doc, "deadline-complaint");
});

test("дата пересчитана по новым данным", () => {
  const c = { ...golden.cases[0].case, last_due: "2027-01-29" };
  const st = reduceCase(c, { rules, calendar, computeDeadline: deadlines.computeDeadline, today: "2027-01-10", replyTypes });
  assert.deepEqual(st.changed, { from: "2027-01-29", to: st.deadlines[0].latest });
});

test("срок на выходном: сохранённая последняя дата не считается пересчётом", () => {
  const c = { id: "k3f9a2m8q1", scenario: "oral-refusal", events: [{ seq: 1, at: "2026-10-13", type: "filed", to: "mo_head" }] };
  const first = reduceCase(c, { rules, calendar, computeDeadline: deadlines.computeDeadline, today: "2026-10-13", replyTypes });
  const d = first.deadlines[0];
  const again = reduceCase({ ...c, last_due: d.latest }, { rules, calendar, computeDeadline: deadlines.computeDeadline, today: "2026-10-13", replyTypes });
  assert.equal(again.changed, null);
});

test("шаги дела: прошедшие события, текущий и будущие шаги", () => {
  const c = golden.cases.find((x) => x.id === "oral-only");
  const st = reduceCase(c.case, { rules, calendar, computeDeadline: deadlines.computeDeadline, today: c.today, replyTypes });
  const steps = buildSteps(c.case, st, { docs: {}, firstDoc: null });
  assert.deepEqual(steps.map((s) => s.state), ["done", "current", "next", "next"]);
  assert.equal(steps[0].date, "2026-10-10");
});

test("подписи событий без имён и без латиницы", () => {
  for (const type of ["oral_refusal", "call", "filed", "registered", "reply", "forwarded", "extended", "docs_requested", "note", "closed"]) {
    const label = eventLabel({ type, at: "2026-10-10", reply_type: "unknown", new_due: "2026-11-01" }, { replyTypes });
    assert.ok(label.length > 3, type);
    assert.doesNotMatch(label, /[A-Za-z]/, type);
  }
});

test("лестница поднимается: после жалобы в регион варианты только выше и прокуратура", async () => {
  const { options } = await import("../../lib/ladder.js");
  const ladder = kitItems("ladder");
  const c = {
    id: "k3f9a2m8q1", schema: 1, created_at: "2026-05-01", scenario: "no-answer", role: "self", respondent_level: 1,
    events: [
      { seq: 1, at: "2026-05-01", type: "filed", to: "mo_head" },
      { seq: 2, at: "2026-07-01", type: "filed", doc: "deadline-complaint", to: "rzn_to" },
    ],
  };
  const st = reduceCase(c, { rules, calendar, computeDeadline: deadlines.computeDeadline, today: "2026-10-11", replyTypes });
  assert.equal(st.stage, "overdue");
  assert.equal(st.level, 2);
  const opts = st.conditions.flatMap((cnd) => options(cnd, st.level, ladder));
  assert.ok(opts.length >= 2);
  for (const o of opts) assert.ok(o.to_level === 3 || o.to === "prosecutor", `${o.to}`);
  assert.ok(!opts.some((o) => o.to === "rzn_to" || o.to === "minzdrav_region"));
});

test("без территориального органа Росздравнадзора варианты начинаются с минздрава региона", async () => {
  const { options } = await import("../../lib/ladder.js");
  const { nextOverdueTarget, missingNodes } = await import("../../lib/case-view.js");
  const ladder = kitItems("ladder");
  const missing = missingNodes("RU-MOW", [{ region_id: "RU-MOW", agency: "minzdrav" }]);
  assert.deepEqual(missing, ["rzn_to"]);
  const opts = options("deadline_passed", 1, ladder, { missing });
  assert.ok(!opts.some((o) => o.to === "rzn_to"));
  assert.equal(nextOverdueTarget(opts).to, "minzdrav_region");
});

test("в «Кому» имя ведомства без пояснений про колл-центр, название региона в скобках остаётся", async () => {
  const { agencyName } = await import("../../lib/case-view.js");
  assert.equal(agencyName("Министерство здравоохранения Калининградской области (Медицинский информационный аналитический центр (Контакт-центр 122)"), "Министерство здравоохранения Калининградской области");
  assert.equal(agencyName("Министерство здравоохранения Республики Татарстан (ГАУЗ Республиканская клиническая больница МЗ РТ, оперативно - диспетчерский отдел)"), "Министерство здравоохранения Республики Татарстан");
  assert.equal(agencyName("Территориальный орган Росздравнадзора по Республике Саха (Якутия)"), "Территориальный орган Росздравнадзора по Республике Саха (Якутия)");
});

test("дело закрыто ответом «просьбу выполнили»: следующего шага нет", () => {
  const c = {
    id: "k3f9a2m8q1", schema: 1, created_at: "2026-08-01", closed_at: "2026-08-20", scenario: "no-answer", role: "self",
    events: [{ seq: 1, at: "2026-08-01", type: "filed", to: "mo_head" }, { seq: 2, at: "2026-08-20", type: "reply", reply_type: "resolved" }],
  };
  const st = reduceCase(c, { rules, calendar, computeDeadline: deadlines.computeDeadline, today: "2026-10-11", replyTypes });
  assert.equal(st.stage, "closed");
  const steps = buildSteps(c, st, { docs: {}, firstDoc: null });
  assert.ok(steps.every((s) => s.state === "done"));
  assert.equal(steps.at(-1).title, "Дело закрыто");
});
