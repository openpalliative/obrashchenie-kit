import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseBackup, validCase, cleanCase, cleanProfile, fieldMeta, stripPersonal, hasPersonal } from "../../lib/backup.js";
import { kitItems } from "./helpers.js";

const file = (n) => readFileSync(`tests/fixtures/backups/${n}.json`, "utf8");
const fields = fieldMeta(kitItems("documents"));
const goodCase = () => JSON.parse(file("good")).entries.find((e) => e.key.startsWith("case:")).value;

test("хороший файл открывается, профиль только из личных полей", () => {
  const r = parseBackup(file("good"), { fields });
  assert.equal(r.ok, true);
  assert.equal(r.cases.length, 1);
  assert.deepEqual(Object.keys(r.profile).sort(), ["applicant_address", "applicant_name", "role"]);
});

test("чужой инструмент", () => {
  const r = parseBackup(file("wrong-repo"), { fields });
  assert.equal(r.ok, false);
  assert.match(r.error_ru, /другого инструмента|не подошёл/);
});

test("больше 1 МБ", () => {
  const r = parseBackup(file("too-big"), { fields });
  assert.equal(r.ok, false);
  assert.match(r.error_ru, /большой/);
});

test("битая схема", () => {
  assert.equal(parseBackup(file("bad-schema"), { fields }).ok, false);
  assert.equal(parseBackup("{не json", { fields }).ok, false);
});

for (const name of ["bad-role", "region-number", "docs-null", "addressees-string"]) {
  test(`файл ${name} не открывается, ошибка по-русски`, () => {
    const r = parseBackup(file(name), { fields });
    assert.equal(r.ok, false);
    assert.match(r.error_ru, /повреждён/);
  });
}

test("мусор в профиле отбрасывается, роль только из списка", () => {
  const r = parseBackup(file("profile-junk"), { fields });
  assert.equal(r.ok, true);
  assert.deepEqual(r.profile, { applicant_name: "Иванова Мария Петровна (пример)" });
  assert.equal(cleanProfile({ role: "proxy" }, { fields }), null);
  assert.equal(cleanProfile("строка", { fields }), null);
});

test("HTML в заметке остаётся текстом и не ломает разбор", () => {
  const r = parseBackup(file("html-note"), { fields });
  assert.equal(r.ok, true);
  const notes = r.cases.flatMap((c) => c.events.map((e) => e.note || ""));
  assert.ok(notes.some((n) => n.includes("<")));
});

test("поля дела по белому списку: лишнее отбрасывается, неверный тип ломает дело", () => {
  const c = goodCase();
  assert.equal(validCase(c, { fields }), true);
  c.extra = "лишнее";
  c.events[0].evil = "<b>";
  const clean = cleanCase(c, { fields });
  assert.equal(clean.extra, undefined);
  assert.equal(clean.events[0].evil, undefined);
  const bad = (patch) => assert.equal(validCase({ ...goodCase(), ...patch }, { fields }), false, JSON.stringify(patch));
  bad({ respondent_level: 4 });
  bad({ respondent_level: "1" });
  bad({ scenario: "evil" });
  bad({ closed_at: "вчера" });
  bad({ last_due: 20261010 });
  bad({ addressees: { mo_head: { name: "x".repeat(241) } } });
  bad({ addressees: { mo_head: { name: "Главврачу", address: "x".repeat(201) } } });
  bad({ docs: { "written-answer": { fields: { request: "x".repeat(801) } } } });
  bad({ docs: { "written-answer": { fields: { applicant_name: "x".repeat(121) } } } });
  bad({ docs: { "written-answer": { fields: { refused_at: "10.10.2026" } } } });
  bad({ docs: { "written-answer": { fields: { request: 5 } } } });
  bad({ docs: { "written-answer": { fields: {}, built_at: "сегодня" } } });
  const ev = (patch) => ({ ...goodCase(), events: [{ ...goodCase().events[1], ...patch }] });
  assert.equal(validCase(ev({ reg_number: "x".repeat(41) }), { fields }), false);
  assert.equal(validCase(ev({ to_respondent: "да" }), { fields }), false);
  assert.equal(validCase(ev({ seq: 0 }), { fields }), false);
  assert.equal(validCase(ev({ type: "hack" }), { fields }), false);
});

test("заметка длиннее 500 знаков не проходит", () => {
  const c = goodCase();
  c.events[0].note = "а".repeat(501);
  assert.equal(validCase(c, { fields }), false);
});

test("отказ запоминать данные убирает личные поля из дел", () => {
  const c = cleanCase({ ...goodCase(), docs: { "written-answer": { fields: { applicant_name: "Иванова", request: "Прислать врача" }, built_at: "2026-10-12" } } }, { fields });
  assert.equal(hasPersonal(c, fields), true);
  const s = stripPersonal(c, fields);
  assert.deepEqual(s.docs["written-answer"].fields, { request: "Прислать врача" });
  assert.equal(hasPersonal(s, fields), false);
});
