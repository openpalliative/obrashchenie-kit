import { test } from "node:test";
import assert from "node:assert/strict";
import { renderDoc, fillText, EXCLUDED, BLANK } from "../../lib/render-doc.js";
import { kitItems } from "./helpers.js";

const docs = Object.fromEntries(kitItems("documents").map((d) => [d.id, d]));
const base = {
  addressee_name: "Главному врачу городской поликлиники", applicant_name: "Иванова Мария Петровна",
  applicant_address: "236000, г. Калининград, ул. Примерная, д. 1", request: "созвать врачебную комиссию",
  refused_at: "2026-10-10", refused_where: "регистратура", answer_way: "post", signed_at: "2026-10-12",
};

test("шесть документов в пакете", () => {
  assert.deepEqual(Object.keys(docs).sort(), ["deadline-complaint", "filing-sheet", "med-records", "repeat-complaint", "vk-extract", "written-answer"]);
});

test("два экземпляра: блок «Принято» только на втором", () => {
  const d = docs["written-answer"];
  assert.equal(renderDoc(d, base, { copy: 1 }).receipt, false);
  assert.equal(renderDoc(d, base, { copy: 2 }).receipt, true);
});

test("обязательные поля по роли", () => {
  const d = docs["written-answer"];
  assert.deepEqual(renderDoc(d, base, { role: "self" }).missing, []);
  const proxy = renderDoc(d, base, { role: "proxy" }).missing.map((m) => m.id);
  assert.ok(proxy.includes("patient_name") && proxy.includes("proxy_date"));
  const noName = renderDoc(d, { ...base, applicant_name: "" }, { role: "self" }).missing.map((m) => m.id);
  assert.ok(noName.includes("applicant_name"));
});

test("условие when=значение и required_if", () => {
  const d = docs["written-answer"];
  const post = renderDoc(d, base).blocks.map((b) => b.id);
  assert.ok(post.includes("answer-post") && !post.includes("answer-email"));
  const email = renderDoc(d, { ...base, answer_way: "email" }).missing.map((m) => m.id);
  assert.ok(email.includes("applicant_email"));
});

test("пустое поле даёт прочерк, дата пишется словами", () => {
  const r = fillText("{{a}} и {{date:b}}", { a: "", b: "2026-10-12" }, { fields: { a: { type: "text" }, b: { type: "date" } } });
  assert.equal(r.text, `${BLANK} и 12 октября 2026 г.`);
  assert.deepEqual(r.empty, ["a"]);
});

test("неизвестный плейсхолдер исключает пункт", () => {
  const d = { title: "Заявление", fields: [], blocks: [{ id: "x", text: "по {{norm:59-fz#st-8}}" }] };
  const r = renderDoc(d, {});
  assert.equal(r.blocks[0].excluded, true);
  assert.equal(r.blocks[0].text, EXCLUDED);
});

test("блок с непроверенной нормой без запасной формулировки не печатается", () => {
  const d = { title: "Жалоба", fields: [], blocks: [{ id: "x", text: "текст", norm_state: "blocked" }] };
  assert.equal(renderDoc(d, {}).blocks[0].excluded, true);
});

test("блок без текста роняет сборку", () => {
  assert.throws(() => renderDoc({ title: "Т", fields: [], blocks: [{ id: "x" }] }, {}));
});

test("в тексте документов нет латиницы и номеров актов литералом", () => {
  for (const d of Object.values(docs)) {
    const r = renderDoc(d, base, { role: "self", copy: 2 });
    for (const b of r.blocks) {
      assert.doesNotMatch(b.text, /[A-Za-z]/, `${d.id}/${b.id}`);
      assert.doesNotMatch(b.text, /\{\{/, `${d.id}/${b.id}`);
    }
    assert.doesNotMatch(r.esiaText, /[A-Za-z]/, d.id);
  }
});

test("текст для Госуслуг и счётчик знаков", () => {
  const r = renderDoc(docs["written-answer"], base);
  assert.ok(r.esiaText.includes("созвать врачебную комиссию"));
  assert.equal(r.chars, [...r.esiaText].length);
});

test("двойная точка после значения поля схлопывается", () => {
  const r = fillText("удостоверил: {{x}}.", { x: "нотариус Петрова А. А." }, { fields: { x: { type: "text" } } });
  assert.equal(r.text, "удостоверил: нотариус Петрова А. А.");
});

test("опись с приложениями собирается списком", () => {
  const d = docs["filing-sheet"];
  const r = renderDoc(d, { applicant_name: "Иванова Мария Петровна", applicant_address: "236000, г. Калининград", filed_to: "Поликлиника", main_doc: "Заявление", attachments: "Копия доверенности, 1 лист\n\nКопия паспорта, 2 листа", signed_at: "2026-10-12" }, { role: "self" });
  const list = r.blocks.find((b) => b.id === "attachments-list");
  assert.deepEqual(list.items, ["Копия доверенности, 1 лист", "Копия паспорта, 2 листа"]);
});

test("ФИО заявителя в шапке без предлога «от», его не склоняем", () => {
  for (const d of Object.values(docs)) {
    const from = renderDoc(d, { ...base, main_doc: "Заявление", filed_to: "в поликлинику" }).blocks.find((b) => b.id === "from");
    assert.ok(from, d.id);
    assert.equal(from.text, "заявитель: Иванова Мария Петровна", d.id);
  }
});

test("запрос медицинских документов: сведения из п. 2 о пациенте и законном представителе", () => {
  const d = docs["med-records"];
  const v = {
    ...base, patient_name: "Петров Пётр (пример)", patient_id_doc: "ПАЦИЕНТ-ДОК", patient_residence: "ПАЦИЕНТ-АДРЕС",
    applicant_id_doc: "ПРЕДСТАВИТЕЛЬ-ДОК", applicant_residence: "ПРЕДСТАВИТЕЛЬ-АДРЕС", records_list: "выписка", records_period: "2026",
    receive_way: "post", inpatient: "no", guardian_act: "решение 1", child_birth_cert: "I-АБ 1", proxy_date: "2026-01-01", proxy_issuer: "нотариус",
  };
  for (const role of ["guardian", "parent"]) {
    const r = renderDoc(d, v, { role });
    assert.deepEqual(r.missing, [], role);
    const text = r.blocks.map((b) => b.text).join("\n");
    for (const s of ["Петров Пётр", "ПАЦИЕНТ-ДОК", "ПАЦИЕНТ-АДРЕС", "Иванова Мария Петровна", "ПРЕДСТАВИТЕЛЬ-ДОК", "ПРЕДСТАВИТЕЛЬ-АДРЕС", v.applicant_address, "выписка", "2026"]) {
      assert.ok(text.includes(s), `${role}: ${s}`);
    }
    const lacking = renderDoc(d, { ...v, applicant_id_doc: "", applicant_residence: "" }, { role }).missing.map((m) => m.id);
    assert.deepEqual(lacking.sort(), ["applicant_id_doc", "applicant_residence"], role);
  }
  for (const role of ["self", "proxy"]) {
    const r = renderDoc(d, { ...v, applicant_id_doc: "", applicant_residence: "" }, { role });
    assert.ok(!r.missing.some((m) => m.id.startsWith("applicant_id") || m.id === "applicant_residence"), role);
    assert.ok(!r.blocks.some((b) => b.id === "representative"), role);
  }
});
