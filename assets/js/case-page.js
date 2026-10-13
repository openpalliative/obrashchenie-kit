import { $, $$, printWith, link, kit, vend, today, dueWords, el, wrap, iconEl, statusEl, unverifiedInline, cloneTpl, readDate3, setDate3, showJs, guardForms, failPage, deadlineStatuses } from "./ok-core.js";
import { store, listCases, saveCase, deleteCase, deleteKey, damaged, getProfile, setProfile, fields, persist, newId, storageNotice, MAX_CASES, pushEvent } from "./ok-store.js";
import { caseState } from "./ok-state.js";
import { readParams, xurl } from "../../ui/js/xparams.js";
import { getRegion, setRegion } from "../../ui/js/region-store.js";
import { buildIcs } from "../../ui/js/ics.js";
import { downloadJson, downloadText, pickFile } from "../../ui/js/files.js";
import { ruDate, ruDateLong } from "../../ui/js/format.js";
import { parseBackup, stripPersonal, hasPersonal, MAX_BYTES } from "../../lib/backup.js";
import { options } from "../../lib/ladder.js";
import { eventLabel, buildSteps, sortedEvents, nextOverdueTarget, missingNodes, agencyName, ruleNotes, TO_NAME } from "../../lib/case-view.js";

guardForms();

const LEVEL_TO = { 1: "mo_head", 2: "minzdrav_region", 3: "minzdrav_rf" };
const NODE_OF = { rzn: "rzn_to", minzdrav: "minzdrav_region" };
const D = {};
let cases = [];
let cur = null;
let wiz = { step: 1, p: {} };
let editing = null;

function show(view) {
  for (const v of $$("[data-view]")) v.hidden = v.dataset.view !== view;
  $(".ok-file").hidden = view === "wizard";
  $("[data-h1]").textContent = view === "wizard" ? "Новое дело" : "Моё дело";
}

const docsMap = () => Object.fromEntries(D.docs.map((d) => [d.id, d]));
const ctx = () => ({ docs: docsMap(), replyTypes: D.replyTypes });
const channelLabel = (id) => D.channels.find((c) => c.id === id)?.label || "";

async function load() {
  const [scenarios, docs, ladder, replyTypes, federal, channels, pack, regions, addressees, lines, rules] = await Promise.all([
    kit("scenarios"), kit("documents"), kit("ladder"), kit("reply-types"), kit("addressees-federal").catch(() => []), kit("channels").catch(() => []),
    kit("pack").catch(() => [{}]),
    vend("pal-directory", "regions"), vend("pal-directory", "addressees"), vend("pal-directory", "region-lines"), vend("pal-norms", "deadline-rules"),
  ]);
  Object.assign(D, { scenarios, docs, ladder, replyTypes, federal, channels, regions, addressees, lines, rules, notes: pack[0]?.rule_notes || [] });
}

async function route() {
  const ids = (list) => (v) => list.some((x) => x.id === v);
  const p = readParams(["new", "s", "region", "rule", "from", "id", "device", "nut"], { s: ids(D.scenarios), region: ids(D.regions), rule: ids(D.rules) });
  cases = await listCases();
  renderDamaged();
  if (p.new) {
    if (cases.filter((c) => !c.closed_at).length >= MAX_CASES) show("limit");
    else startWizard(p);
    return;
  }
  cur = cases.find((c) => c.id === p.id) || cases.find((c) => !c.closed_at) || cases[0] || null;
  if (cur) await renderCase();
  else show("empty");
}

function renderDamaged() {
  const box = $("[data-damaged]");
  box.hidden = !damaged.length;
  if (!damaged.length) return;
  const st = statusEl("warning", "Внимание", damaged.length > 1 ? "Несколько дел повреждены, их не показываем. Сохраните файл и удалите их" : "Одно дело повреждено, его не показываем. Сохраните файл и удалите его");
  const b = el("button", "op-btn op-btn--danger");
  b.type = "button";
  b.append(iconEl("trash-2"), el("span", null, damaged.length > 1 ? "Удалить повреждённые дела" : "Удалить повреждённое дело"));
  b.addEventListener("click", async () => {
    if (!(await ask("Удалить повреждённое дело?", "Его нельзя открыть. Если вы ещё не сохранили файл, нажмите «Отмена» и сначала сохраните его", "Да, удалить"))) return;
    for (const key of [...damaged]) await deleteKey(key);
    await route();
  });
  const acts = el("div", "op-actions");
  acts.append(b);
  box.replaceChildren(st, acts);
}

function startWizard(p) {
  const form = $("[data-view=wizard]");
  form.reset();
  if (p.s) form.querySelector(`input[name=scenario][value="${p.s}"]`).checked = true;
  $("#ok-region").value = p.region || getRegion() || "";
  if (p.from) setDate3($("#ok-filed"), p.from);
  wiz = { step: p.s ? 2 : 1, p };
  show("wizard");
  showQ();
}

function scenarioId() {
  return $("input[name=scenario]:checked")?.value || "";
}

function showQ() {
  const sid = scenarioId();
  for (const q of $$("[data-q]")) q.hidden = Number(q.dataset.q) !== wiz.step;
  for (const b of $$("[data-for]")) b.hidden = !b.dataset.for.split(" ").includes(sid);
  $("[data-q4-title]").textContent = sid === "no-answer" ? "Когда и куда вы подали обращение?" : sid === "forwarded" ? "Когда переслали?" : sid === "discharge" ? "Когда сказали о выписке?" : "Когда вам отказали?";
  $("[data-wizard-count]").textContent = `Шаг ${wiz.step} из 4`;
  $("[data-wizard-intro]").hidden = wiz.step !== 1 && !(wiz.step === 2 && wiz.p.s);
  $("[data-back-step]").hidden = wiz.step === 1;
  $("[data-next-step] span").textContent = wiz.step === 4 ? "Готово: открыть дело" : "Дальше";
  $("[data-wizard-error]").hidden = true;
  $(`[data-q="${wiz.step}"] input, [data-q="${wiz.step}"] select`)?.focus();
}

function wizError(text) {
  const box = $("[data-wizard-error]");
  box.replaceChildren(statusEl("error", "Ошибка", text));
  box.hidden = false;
  box.focus();
}

async function wizNext(e) {
  e.preventDefault();
  const sid = scenarioId();
  if (wiz.step === 1 && !sid) return wizError("Выберите, что произошло");
  if (wiz.step === 2 && !$("input[name=role]:checked")) return wizError("Выберите, кто будет подавать документы");
  if (wiz.step === 3 && !$("#ok-region").value) return wizError("Выберите регион или пункт «Моего региона нет в списке»");
  if (wiz.step < 4) {
    wiz.step += 1;
    return showQ();
  }
  const fs = sid === "no-answer" ? $("#ok-filed") : sid === "forwarded" ? $("#ok-fwd") : $("#ok-when");
  const { iso, error } = readDate3(fs, { notBefore: "2000-01-01" });
  if (error) return wizError(error);
  await createCase(sid, iso);
}

async function createCase(sid, at) {
  const sc = D.scenarios.find((s) => s.id === sid);
  const region = $("#ok-region").value;
  const events = [];
  let level = 1;
  if (sid === "no-answer") {
    level = Number($("input[name=level]:checked").value);
    events.push({ seq: 1, at, type: "filed", to: LEVEL_TO[level], rule_id: wiz.p.rule || null, reg_number: $("#ok-reg").value.trim().slice(0, 40), edited_at: null });
  } else if (sid === "forwarded") {
    level = Number($("input[name=flevel]:checked").value);
    events.push({ seq: 1, at, type: "forwarded", to_respondent: true, edited_at: null });
  } else {
    const channel = $("input[name=channel]:checked")?.value || "visit";
    const title = sid === "discharge" ? "Сказали о выписке" : sid === "vk-refused" ? "Не созвали врачебную комиссию или отказали" : null;
    events.push(title ? { seq: 1, at, type: "note", title, channel, edited_at: null } : { seq: 1, at, type: "oral_refusal", channel, edited_at: null });
  }
  const c = {
    id: newId(), schema: 1, created_at: today(), closed_at: null, scenario: sid, start_condition: sc?.start_condition || null,
    role: $("input[name=role]:checked").value, region_id: region === "none" ? null : region, respondent_level: level,
    device: wiz.p.device || null, nut: wiz.p.nut || null, pack_version: (await kit("pack").catch(() => [{}]))[0]?.version || null,
    addressees: {}, docs: {}, events, last_due: null,
  };
  if (region !== "none") setRegion(region);
  await saveCase(c);
  storageNotice(await store(), $("[data-notices]"));
  cases = await listCases();
  cur = c;
  await renderCase();
  $("[data-h1]").focus();
}

function regionName(id) {
  return D.regions.find((r) => r.id === id)?.name || "";
}

function docHref(doc, to = null) {
  return `../docs/${doc}/#id=${cur.id}${to ? `&to=${to}` : ""}`;
}

function btn(href, label, kind = "secondary", icon = "file-text") {
  const a = el("a", `op-btn op-btn--${kind}${kind === "primary" ? " op-btn--large" : ""}`);
  a.href = href;
  a.append(iconEl(icon), el("span", null, label));
  return a;
}

function caseLine() {
  const sc = D.scenarios.find((s) => s.id === cur.scenario);
  const parts = [sc?.title || "Дело", regionName(cur.region_id) || "регион не выбран", `начато ${ruDate(cur.created_at)}`];
  const box = $("[data-caseline]");
  box.replaceChildren(parts.join(" · "));
  if (cur.device) box.append(" · ", link(xurl("pal-devices-data", `devices/${cur.device}/`), `изделие с кодом ${cur.device}`));
  if (cur.nut) box.append(" · ", link(xurl("pal-devices-data", `nutrition/${cur.nut}/`), "лечебное питание из перечня"));
  return parts.join(" · ");
}

async function renderCase() {
  show("case");
  const slot = $("[data-draft-slot]");
  if (!slot.childElementCount) slot.append(cloneTpl("ok-draft-tpl"));
  const st = await caseState(cur);
  const d = st.deadlines[0];
  if (d && cur.last_due !== d.latest) {
    cur.last_due = d.latest;
    await saveCase(cur);
  }
  caseLine();
  renderSwitch();
  const missing = missingNodes(cur.region_id, D.addressees);
  const opts = st.conditions.flatMap((cnd) => options(cnd, st.level, D.ladder, { missing }));
  renderDue(st, d, opts);
  renderOptions(st, opts);
  $("[data-answer-link]").href = `../answer/#id=${cur.id}`;
  $("[data-case-ics]").hidden = !d || d.overdue || st.stage === "closed";
  const sc = D.scenarios.find((s) => s.id === cur.scenario);
  const firstDoc = opts.find((o) => o.doc)?.doc || sc?.docs?.[0];
  $("[data-ladder]").replaceChildren(...buildSteps(cur, st, { ...ctx(), firstDoc }).map(stepItem));
  renderJournal();
  renderAddressees(missing);
  const built = Object.keys(cur.docs || {}).filter((k) => docsMap()[k]);
  $("[data-casedocs-wrap]").hidden = !built.length;
  $("[data-casedocs]").replaceChildren(...built.map((k) => {
    const a = link(docHref(k), "");
    a.append(iconEl("file-text"), el("span", null, `${docsMap()[k].name}, собран ${ruDate(cur.docs[k].built_at)}`));
    return wrap("li", a);
  }));
  $("[data-close-case] span").textContent = cur.closed_at ? "Открыть дело снова" : "Закрыть дело";
  persistNotice().catch((e) => console.warn(e));
}

let persistAsked = false;
async function persistNotice() {
  const s = await store();
  const box = $("[data-persist]");
  if (persistAsked || s.volatile || (await s.get("seen:persist"))) return;
  persistAsked = true;
  if ((await persist()) !== false) return;
  await s.set("seen:persist", true);
  const st = statusEl("info", "Важно", "Браузер может удалить дела, если на устройстве мало места. Сохраните файл дела");
  const b = el("button", "op-btn op-btn--secondary");
  b.type = "button";
  b.append(iconEl("download"), el("span", null, "Сохранить файл дела"));
  b.addEventListener("click", exportCases);
  box.replaceChildren(st, b);
  box.hidden = false;
}

function renderSwitch() {
  const sw = $("[data-switch]");
  sw.hidden = cases.length < 2;
  const sel = $("[data-switch-select]");
  sel.replaceChildren(...cases.map((c) => {
    const o = el("option", null, `${D.scenarios.find((s) => s.id === c.scenario)?.title || "Дело"}, начато ${ruDate(c.created_at)}${c.closed_at ? ", закрыто" : ""}`);
    o.value = c.id;
    o.selected = c.id === cur.id;
    return o;
  }));
}

function renderDue(st, d, opts) {
  const box = $("[data-due]");
  const prim = $("[data-primary]");
  box.replaceChildren();
  prim.replaceChildren();
  box.after(prim);
  box.classList.toggle("ok-due--plain", st.stage === "closed" || Boolean(cur.closed_at));
  if (st.stage === "closed" || cur.closed_at) {
    box.append(statusEl("done", "Готово", `Дело закрыто ${ruDate(cur.closed_at || today())}`));
    return;
  }
  if (d) {
    box.append(el("p", "ok-due__label", d.overdue ? "Ответ должен был прийти до" : d.user_entered ? "Ответ должны прислать до" : "Ответ должен прийти до"));
    box.append(el("p", "ok-due__date", dueWords(d.due)));
    if (d.formula) box.append(el("p", "ok-due__formula", [d.formula, d.note].filter(Boolean).join(". ")));
    if (d.rule_id) box.append(wrap("p", link(xurl("pal-norms", `deadlines/${d.rule_id}/`, { from: d.start }), "Откуда этот срок", "ok-due__src")));
    box.append(...deadlineStatuses(d, ruleNotes(d, D.notes)));
    if (st.changed) box.append(statusEl("info", "Важно", `Дата пересчитана по новым данным: было ${ruDate(st.changed.from)}, стало ${ruDate(st.changed.to)}`));
  } else if (st.stage === "prepare") {
    const first = opts.find((o) => o.doc);
    box.append(el("p", "ok-due__label", "Следующий шаг"));
    box.append(el("p", "ok-due__next", first ? docsMap()[first.doc]?.name || first.label : "Собрать документ"));
    box.append(el("p", "ok-due__formula", "Срок ответа начнёт считаться, когда вы подадите документ"));
  }
  if (st.stage === "answered") {
    const last = sortedEvents(cur).filter((e) => e.type !== "note").pop();
    box.append(el("p", "ok-due__label", `Последнее событие, ${ruDate(last?.at || cur.created_at)}`));
    box.append(el("p", "ok-due__next", last ? eventLabel(last, ctx()) : ""));
    box.append(el("p", "ok-due__formula", "Ниже варианты следующего шага. Если просьбу выполнили, дело можно закрыть"));
  }
  if (st.stage === "overdue") {
    const target = nextOverdueTarget(opts);
    box.before(prim);
    prim.append(statusEl("deadline", "Срок", `Ответ не пришёл в срок. Следующий шаг: жалоба ${target?.where ? `в ${target.where}` : "выше"}`));
    prim.append(btn(docHref("deadline-complaint", target?.to), "Собрать жалобу на нарушение срока", "primary", "file-text"));
  } else if (st.stage === "prepare") {
    const first = opts.find((o) => o.doc);
    if (first) prim.append(btn(docHref(first.doc, first.to), "Собрать документ", "primary"));
  }
}

function renderOptions(st, opts) {
  const sec = $("[data-options]");
  const visible = st.stage !== "waiting" && st.stage !== "closed" && !cur.closed_at && opts.length > (["prepare", "overdue"].includes(st.stage) ? 1 : 0);
  sec.hidden = !visible;
  if (!visible) return;
  const rt = (st.last_reply && D.replyTypes.find((t) => t.id === st.last_reply.reply_type)) || D.replyTypes.find((t) => t.condition === st.conditions[0] && t.parent);
  $("[data-options-meaning]").textContent = rt?.meaning || "Выберите то, что подходит вам. Документ составляете вы";
  $("#ok-opt-title").textContent = st.stage === "prepare" || st.stage === "overdue" ? "Другие варианты. Решаете вы" : "Варианты. Решаете вы";
  const target = st.stage === "overdue" ? nextOverdueTarget(opts) : null;
  const skip = st.stage === "prepare" ? opts.findIndex((o) => o.doc) : target ? opts.findIndex((o) => o.to === target.to && o.doc === "deadline-complaint") : -1;
  $("[data-optlist]").replaceChildren(...opts.filter((_, i) => i !== skip).slice(0, 6).map((o) => optionItem(o, (doc, to) => docHref(doc, to))));
}

function optionItem(o, href) {
  const li = cloneTpl("ok-option-item");
  li.querySelector(".ok-opt__label").textContent = o.label;
  li.querySelector(".ok-opt__to").textContent = o.hint || "";
  const a = li.querySelector(".ok-opt__btn");
  if (o.doc && docsMap()[o.doc]) a.href = href(o.doc, o.to);
  else a.remove();
  return li;
}

function stepItem(s) {
  const li = cloneTpl("ok-ladder-item");
  li.classList.add(`is-${s.state}`);
  if (s.state === "current") li.setAttribute("aria-current", "step");
  const mark = li.querySelector(".ok-ladder__mark");
  if (s.state === "done") mark.append(iconEl("check"), el("span", "op-visually-hidden", "Сделано:"));
  else mark.append(el("span", "op-visually-hidden", s.state === "current" ? "Сейчас:" : "Потом:"));
  li.querySelector(".ok-ladder__title").textContent = s.title;
  li.querySelector(".ok-ladder__date").textContent = s.date ? (s.until ? `до ${dueWords(s.date)}` : ruDate(s.date)) : "";
  return li;
}

function reopensCase(ev) {
  return ev.type === "closed" || (ev.type === "reply" && ev.reply_type === "resolved");
}

function renderJournal() {
  $("[data-journal]").replaceChildren(...sortedEvents(cur).map((ev) => {
    const li = cloneTpl("ok-journal-item");
    const t = li.querySelector("time");
    t.dateTime = ev.at;
    t.textContent = ruDate(ev.at);
    const label = eventLabel(ev, ctx());
    li.querySelector(".ok-journal__what").textContent = label;
    const how = ev.type === "filed" && channelLabel(ev.channel) ? `Как подали: ${channelLabel(ev.channel).toLowerCase()}` : "";
    li.querySelector(".ok-journal__note").textContent = [how, ev.note].filter(Boolean).join(". ");
    li.querySelector(".ok-journal__edited").textContent = ev.edited_at ? `изменено ${ruDate(ev.edited_at)}` : "";
    const edit = li.querySelector("[data-edit]");
    if (ev.type === "closed") edit.remove();
    else edit.addEventListener("click", () => openEvent(ev));
    const reopen = reopensCase(ev) && cur.closed_at;
    li.querySelector("[data-del]").addEventListener("click", async () => {
      const text = reopen ? `Запись «${label}» пропадёт из журнала, дело снова станет открытым` : `«${label}» пропадёт из журнала. Сроки пересчитаются`;
      if (!(await ask("Удалить запись?", text, "Да, удалить"))) return;
      cur.events = cur.events.filter((x) => x !== ev);
      if (reopen && !cur.events.some(reopensCase)) cur.closed_at = null;
      await saveCase(cur);
      await renderCase();
    });
    return li;
  }));
}

function lineItem(l) {
  const p = el("p", "ok-addr__line");
  p.append(link(`tel:${l.tel}`, `${l.number_display}${l.ext_text ? ` (${l.ext_text})` : ""}`, "ok-addr__num"));
  const extra = [l.topic_text, l.is_24x7 ? "круглосуточно" : l.hours_text, l.foreign_number ? "номер другого учреждения" : ""].filter(Boolean).join(", ");
  if (extra) p.append(el("span", "ok-addr__extra", extra));
  return p;
}

function addrInput(a, node) {
  const f = cloneTpl("ok-addr-input");
  const inp = f.querySelector("input");
  inp.id = `ok-addr-${a.id}`;
  f.querySelector("label").htmlFor = inp.id;
  inp.value = cur.addressees?.[node]?.address || "";
  inp.addEventListener("change", async () => {
    cur.addressees = { ...cur.addressees, [node]: { ...(cur.addressees?.[node] || {}), name: cur.addressees?.[node]?.name || a.name, address: inp.value.trim().slice(0, 200) } };
    await saveCase(cur);
  });
  return f;
}

function renderAddressees(missing) {
  const box = $("[data-addressees]");
  box.replaceChildren();
  const rid = cur.region_id;
  let unverifiedLines = null;
  if (rid) {
    const pd = xurl("pal-directory", `regions/${rid.toLowerCase()}/`);
    const list = D.addressees.filter((a) => a.region_id === rid);
    box.append(el("h3", "ok-addr__h", regionName(rid)));
    if (missing.includes("rzn_to")) {
      const p = el("p", "ok-addr__none", "Территориального органа Росздравнадзора в нашем списке для этого региона нет. ");
      p.append(link(pd, "Страница региона"));
      box.append(p);
    }
    for (const a of list) {
      const card = el("div", "ok-addr");
      card.append(el("p", "ok-addr__name", agencyName(a.name)));
      const lines = D.lines.filter((x) => (a.line_ids || []).includes(x.id) && !x.hidden && x.origin !== "synthetic");
      for (const l of lines.slice(0, 3)) card.append(lineItem(l));
      if (lines.length > 3) card.append(el("p", "ok-muted", `Ещё ${lines.length - 3} на странице региона`));
      if (lines.some((x) => x.verified !== true)) unverifiedLines = lines.find((x) => x.verified !== true).assured_date || unverifiedLines || "";
      if (NODE_OF[a.agency]) card.append(addrInput(a, NODE_OF[a.agency]));
      else card.append(el("p", "ok-muted", "Только телефон. Жалобы на врачебную комиссию сюда не направляют"));
      box.append(card);
    }
    if (unverifiedLines !== null) {
      const note = el("p", "ok-addr__src");
      note.append(unverifiedInline(), el("span", null, `Номера из таблицы горячих линий Росздравнадзора${unverifiedLines ? ` от ${ruDate(unverifiedLines)}` : ""}, звонком мы их не проверяли`));
      box.append(note);
    }
    if (!list.length) box.append(el("p", null, "По этому региону ведомств в списке пока нет"));
    box.append(wrap("p", link(pd, "Все номера и ведомства региона")));
  } else box.append(el("p", null, "Регион не выбран. Адрес ведомства впишите в документ сами, он есть на сайте ведомства"));
  if (D.federal.length) {
    box.append(el("h3", "ok-addr__h", "Федеральные ведомства"));
    const ul = el("ul", "ok-fed");
    for (const f of D.federal) {
      const a = link(f.url, f.label);
      a.rel = "noopener noreferrer";
      const meta = el("span", "ok-fed__meta", `откроется сайт ${new URL(f.url).host}`);
      if (!f.verified) meta.append(unverifiedInline());
      ul.append(wrap("li", a, meta));
    }
    box.append(ul);
  }
}

function openEvent(ev = null) {
  editing = ev;
  const dlg = $("[data-event-dialog]");
  const f = dlg.querySelector("form");
  f.reset();
  $("[data-ev-title]").textContent = ev ? "Исправить запись" : "Добавить событие";
  f.type.value = ev?.type || "filed";
  setDate3($("#ok-ev-at"), ev?.at || today());
  if (ev) {
    for (const k of ["doc", "to", "channel", "reg_number", "note"]) if (ev[k] && f[k]) f[k].value = ev[k];
    if (ev.type === "forwarded") f.to_respondent.value = ev.to_respondent ? "1" : "0";
    if (ev.new_due) setDate3($("#ok-ev-due"), ev.new_due);
  }
  syncEventFields();
  dlg.showModal();
}

function syncEventFields() {
  const type = $("#ok-ev-type").value;
  for (const n of $$("[data-ev-for]")) n.hidden = !n.dataset.evFor.split(" ").includes(type);
}

async function saveEvent(e) {
  const dlg = $("[data-event-dialog]");
  if (e.submitter?.value !== "save") return;
  e.preventDefault();
  const f = dlg.querySelector("form");
  const at = readDate3($("#ok-ev-at"));
  if (at.error) return;
  const type = f.type.value;
  const ev = editing || { seq: Math.max(0, ...cur.events.map((x) => x.seq || 0)) + 1 };
  Object.assign(ev, { at: at.iso, type, note: f.note.value.trim().slice(0, 500) });
  if (type === "filed") Object.assign(ev, { doc: f.doc.value, to: f.to.value, channel: f.channel.value, rule_id: D.ladder.find((x) => x.doc === f.doc.value && x.rule_id)?.rule_id || null });
  if (type === "filed" || type === "registered") ev.reg_number = f.reg_number.value.trim().slice(0, 40);
  if (type === "forwarded") ev.to_respondent = f.to_respondent.value === "1";
  if (type === "extended") {
    const due = readDate3($("#ok-ev-due"), { notFuture: false });
    if (due.error) return;
    ev.new_due = due.iso;
  }
  if (editing) ev.edited_at = today();
  else cur.events.push({ ...ev, edited_at: null });
  dlg.close();
  await saveCase(cur);
  if (type === "reply" && !editing) location.href = `../answer/#id=${cur.id}`;
  else await renderCase();
}

function ask(title, text, yes, { danger = true } = {}) {
  const dlg = $("[data-confirm]");
  $("[data-confirm-title]").textContent = title;
  $("[data-confirm-text]").textContent = text;
  const y = $("[data-confirm-yes]");
  y.className = `op-btn op-btn--${danger ? "danger" : "primary"}`;
  y.querySelector(".op-icon")?.toggleAttribute("hidden", !danger);
  y.querySelector("span").textContent = yes;
  $("[data-confirm-no] span").textContent = danger ? "Отмена" : "Нет";
  dlg.returnValue = "";
  dlg.showModal();
  return new Promise((resolve) => dlg.addEventListener("close", () => resolve(dlg.returnValue === "yes"), { once: true }));
}

async function exportCases() {
  const s = await store();
  const data = await s.exportAll();
  data.entries = data.entries.filter((e) => typeof e.key === "string" && (e.key.startsWith("case:") || e.key === "profile"));
  downloadJson(data, `dela-${today()}.json`);
  $("[data-file-live]").textContent = "Файл дела сохранён. Найдите его в папке загрузок";
}

async function importCases() {
  const live = $("[data-file-live]");
  const file = await pickFile();
  if (!file) return;
  if (file.size > MAX_BYTES) {
    live.textContent = "Файл слишком большой. Файл дел весит меньше 1 МБ";
    return;
  }
  const meta = await fields();
  const r = parseBackup(await file.text(), { fields: meta });
  if (!r.ok) {
    live.textContent = r.error_ru;
    return;
  }
  const existing = await listCases();
  const clash = r.cases.filter((c) => existing.some((x) => x.id === c.id));
  const fresh = r.cases.filter((c) => !existing.some((x) => x.id === c.id));
  if (existing.length + fresh.length > MAX_CASES) {
    live.textContent = `На устройстве поместится не больше ${MAX_CASES} дел. Удалите лишние и откройте файл снова`;
    return;
  }
  if (clash.length && !(await ask("Заменить дело?", "В файле есть дело, которое уже есть на устройстве. Заменить его версией из файла?", "Да, заменить"))) return;
  let list = clash.length ? r.cases : fresh;
  if (r.profile || list.some((c) => hasPersonal(c, meta))) {
    const keep = await ask("Запомнить ваши данные?", "В файле есть ваши данные (ФИО, адрес). Запомнить их на этом устройстве?", "Да, запомнить", { danger: false });
    if (keep && r.profile) await setProfile(r.profile);
    if (!keep) list = list.map((c) => stripPersonal(c, meta));
  }
  try {
    for (const c of list) await saveCase(c);
    cases = await listCases();
    cur = cases.find((c) => c.id === list[0]?.id) || cur;
    if (cur) await renderCase();
    live.textContent = "Дела из файла открыты";
  } catch (e) {
    console.warn(e);
    live.textContent = "Не получилось открыть дела из файла. Дела на устройстве не удалены, обновите страницу";
  }
}

async function wipeAll() {
  if (!(await ask("Удалить всё с этого устройства?", "Все дела, журнал и запомненные данные этого инструмента будут удалены. Вернуть их будет нельзя. Если нужна копия, сначала нажмите «Сохранить файлом»", "Да, удалить всё"))) return;
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith("ok:")) localStorage.removeItem(k);
  } catch {}
  try {
    await (await store()).wipe();
  } catch (e) {
    $("[data-file-live]").textContent = `Не получилось удалить. ${e?.name === "StoreError" ? e.message : "Закройте другие вкладки с инструментами и нажмите ещё раз"}`;
    return;
  }
  cur = null;
  cases = [];
  $("[data-persist]").replaceChildren();
  await route();
  $("[data-file-live]").textContent = "Готово. Дела удалены с этого устройства. Файлы дел и PDF, которые вы скачали, остались в папке загрузок. Удалите их там, если они больше не нужны";
}

function timelineCell(text) {
  return el("td", null, text || "");
}

async function printTimeline() {
  const st = await caseState(cur);
  const profile = await getProfile();
  const rows = sortedEvents(cur).map((ev) => {
    const tr = el("tr");
    const how = ev.type === "filed" ? channelLabel(ev.channel) : "";
    const to = TO_NAME[ev.to] || "";
    tr.append(timelineCell(ruDate(ev.at)), timelineCell(eventLabel({ ...ev, to: null }, ctx())), timelineCell(to && to[0].toUpperCase() + to.slice(1)), timelineCell(ev.reg_number), timelineCell([how, ev.note].filter(Boolean).join(". ")));
    return tr;
  });
  $("[data-tl-printed]").textContent = `Распечатано ${ruDateLong(today())}`;
  $("[data-tl-case]").textContent = caseLine();
  $("[data-tl-who]").textContent = profile?.applicant_name ? `Заявитель: ${profile.applicant_name}` : "";
  $("[data-tl-rows]").replaceChildren(...rows);
  const docs = Object.entries(cur.docs || {}).filter(([k]) => docsMap()[k]);
  $("[data-tl-docs]").replaceChildren(...(docs.length ? docs.map(([k, v]) => el("li", null, `${docsMap()[k].name}, собран ${ruDate(v.built_at)}`)) : [el("li", null, "Документы в этом деле ещё не собирали")]));
  const due = $("[data-tl-due]");
  const d = st.deadlines[0];
  due.replaceChildren();
  if (d && st.stage !== "closed" && !cur.closed_at) {
    due.append(el("p", null, `Ответ должен прийти до ${ruDateLong(d.due)}. ${d.formula || ""}`.trim()), ...deadlineStatuses(d, ruleNotes(d, D.notes)));
  } else {
    const reply = st.last_reply;
    const text = cur.closed_at ? `Дело закрыто ${ruDate(cur.closed_at)}` : st.stage === "answered" ? `${reply ? `Ответ пришёл ${ruDate(reply.at)}. ` : ""}Новый срок начнёт считаться со следующей подачи` : "Срок начнёт считаться после подачи документа";
    due.append(el("p", null, text));
  }
  printWith("ok-printing-timeline", "Хронология обращения");
}

function wire() {
  $("[data-view=wizard]").addEventListener("submit", wizNext);
  $("[data-back-step]").addEventListener("click", () => { wiz.step = Math.max(1, wiz.step - 1); showQ(); });
  $("[data-show-cases]").addEventListener("click", async () => { cur = cases[0]; await renderCase(); });
  $("[data-switch-select]").addEventListener("change", async (e) => { cur = cases.find((c) => c.id === e.target.value); await renderCase(); });
  $("[data-add-event]").addEventListener("click", () => openEvent());
  $("#ok-ev-type").addEventListener("change", syncEventFields);
  $("[data-event-dialog] form").addEventListener("submit", saveEvent);
  $("[data-case-ics]").addEventListener("click", async () => {
    const d = (await caseState(cur)).deadlines[0];
    if (!d) return;
    downloadText(buildIcs([{ uid: `${cur.id}-${d.due}@openpalliative`, date: d.due, summary: "Срок по обращению", description: "Проверьте, пришёл ли ответ. Если нет, откройте дело на сайте", alarmsDaysBefore: [1] }]), "srok.ics", "text/calendar;charset=utf-8");
  });
  $("[data-print-timeline]").addEventListener("click", () => printTimeline().catch(failPage));
  $("[data-close-case]").addEventListener("click", async () => {
    if (cur.closed_at) {
      cur.closed_at = null;
      cur.events = cur.events.filter((e) => e.type !== "closed");
    } else {
      cur.closed_at = today();
      pushEvent(cur, { at: today(), type: "closed" });
    }
    await saveCase(cur);
    await renderCase();
  });
  $("[data-delete-case]").addEventListener("click", async () => {
    if (!(await ask("Удалить это дело?", "Дело, журнал и данные документов этого дела пропадут с устройства. Вернуть их будет нельзя. Если нужна копия, сначала сохраните файл дела", "Да, удалить"))) return;
    await deleteCase(cur.id);
    cur = null;
    await route();
  });
  $("[data-export]").addEventListener("click", exportCases);
  $("[data-import]").addEventListener("click", () => importCases().catch((e) => {
    console.warn(e);
    $("[data-file-live]").textContent = "Не получилось открыть файл. Дела на устройстве не удалены";
  }));
  $("[data-wipe]").addEventListener("click", wipeAll);
  window.addEventListener("hashchange", route);
}

async function main() {
  storageNotice(await store(), $("[data-notices]"));
  await load();
  wire();
  await route();
  showJs();
  if (!$("[data-view=wizard]").hidden) showQ();
}

main().catch(failPage);
