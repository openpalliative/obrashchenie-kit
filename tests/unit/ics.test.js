import { test } from "node:test";
import assert from "node:assert/strict";
import { buildIcs } from "../../opsite/ui/js/ics.js";

const text = buildIcs([{ uid: "abc0000000-2026-11-13@openpalliative", date: "2026-11-13", summary: "Срок по обращению", description: "Проверьте, пришёл ли ответ", alarmsDaysBefore: [1] }], { now: new Date("2026-10-12T10:00:00Z") });

test("строки через CRLF", () => {
  assert.ok(text.includes("\r\n"));
  assert.equal(text.split("\r\n").filter((l) => l && !l.startsWith(" ")).every((l) => /^[A-Z-]+[:;]/.test(l)), true);
});

test("событие на весь день", () => {
  assert.match(text, /DTSTART;VALUE=DATE:20261113/);
  assert.match(text, /DTEND;VALUE=DATE:20261114/);
});

test("напоминание за день", () => {
  assert.match(text, /BEGIN:VALARM[\s\S]*TRIGGER:-P1D/);
});

test("в заголовке нет имён и названий организаций", () => {
  const summary = /SUMMARY:(.*)/.exec(text)[1];
  assert.equal(summary, "Срок по обращению");
});
