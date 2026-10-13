import { test } from "node:test";
import assert from "node:assert/strict";
import { options, splitLadder, levelOf } from "../../lib/ladder.js";
import { kitItems } from "./helpers.js";

const ladder = kitItems("ladder");
const replyTypes = kitItems("reply-types");
const { nodes, edges } = splitLadder(ladder);
const conditions = [...new Set(edges.map((e) => e.from_condition))];

test("у рёбер лестницы есть уровень адресата", () => {
  assert.ok(edges.length > 10);
  assert.ok(edges.every((e) => e.to === "none" || e.to_level || levelOf(e.to, nodes)));
});

for (const level of [1, 2, 3]) {
  test(`уровень ${level}: жалоба не уходит в тот же уровень и ниже, кроме прокуратуры`, () => {
    for (const cnd of conditions) {
      for (const o of options(cnd, level, ladder)) {
        if (o.kind !== "complaint" || o.to === "prosecutor") continue;
        assert.ok(o.to_level > level, `${cnd} -> ${o.to} (${o.to_level}) при уровне ${level}`);
      }
    }
  });
}

test("у каждого типа ответа, кроме выполненной просьбы, есть вариант", () => {
  for (const t of replyTypes) {
    if (t.condition === "resolved") continue;
    const any = [1, 2].some((lvl) => options(t.condition, lvl, ladder).length > 0);
    assert.ok(any, `${t.id} (${t.condition})`);
  }
});

test("переслали обжалуемому: повторная жалоба выше, без обжалуемого уровня", () => {
  const opts = options("forwarded_to_respondent", 1, ladder);
  assert.ok(opts.some((o) => o.doc === "repeat-complaint"));
  assert.ok(opts.every((o) => o.to_level !== 1));
});
