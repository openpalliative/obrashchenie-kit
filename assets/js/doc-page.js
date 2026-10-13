import { $, $$, printWith, link, kit, vend, today, dueWords, el, wrap, iconEl, statusEl, cloneTpl, readDate3, setDate3, showJs, guardForms, failPage, deadlineStatuses } from "./ok-core.js";
import { getCase, saveCase, getProfile, setProfile, persist, store, storageNotice, pushEvent } from "./ok-store.js";
import { caseState } from "./ok-state.js";
import { readParams, parseFragment, xurl } from "../../ui/js/xparams.js";
import { buildIcs } from "../../ui/js/ics.js";
import { downloadText } from "../../ui/js/files.js";
import { plural } from "../../ui/js/format.js";
import { copyText } from "../../ui/js/copy.js";
import { renderDoc, holds, EXCLUDED } from "../../lib/render-doc.js";
import { NODE_LEVEL } from "../../lib/ladder.js";
import { addresseeName, missingNodes, ruleNotes } from "../../lib/case-view.js";

guardForms();

const root = $("[data-doc]");
const rawTo = parseFragment(location.hash)?.to;
let doc;
let ladder = [];
let channels = [];
let cs = null;
let role = "self";
let target = null;
let result = null;
let due = null;

const fieldEls = () => $$("[data-field]", root);
const roleOk = (w) => !w.dataset.roles || w.dataset.roles.split(" ").includes(role);
const roleValues = () => $$("input[name=role]", root).map((r) => r.value);

function setRole(value) {
  const list = roleValues();
  role = list.includes(value) ? value : list.includes("self") ? "self" : list[0] || "self";
  const r = $$("input[name=role]", root).find((x) => x.value === role);
  if (r) r.checked = true;
}

function readValues() {
  const v = {};
  for (const w of fieldEls()) {
    if (!roleOk(w)) continue;
    if (w.dataset.type === "date") {
      const fs = $("[data-date3]", w);
      const filled = $$("input, select", fs).some((i) => i.value.trim());
      v[w.dataset.field] = filled ? readDate3(fs, { notFuture: w.dataset.field !== "signed_at" }).iso || "" : "";
    } else v[w.dataset.field] = $("input, select, textarea", w).value.trim();
  }
  return v;
}

function writeValues(v) {
  for (const w of fieldEls()) {
    const val = v[w.dataset.field];
    if (typeof val !== "string") continue;
    if (w.dataset.type === "date") setDate3($("[data-date3]", w), /^\d{4}-\d{2}-\d{2}$/.test(val) ? val : "");
    else $("input, select, textarea", w).value = val;
  }
}

function syncRole() {
  setRole($("input[name=role]:checked", root)?.value || role);
  for (const w of $$("[data-roles]", root)) w.hidden = !roleOk(w);
}

function fieldError(w, text) {
  if (w.dataset.type === "date") return;
  const box = $(".op-field__error", w);
  const input = $("input, select, textarea", w);
  box.hidden = !text;
  $("[data-error]", box).textContent = text || "";
  w.querySelector(".op-field").classList.toggle("op-field--error", Boolean(text));
  const ids = [$(".op-field__hint", w)?.id, text ? box.id : null].filter(Boolean).join(" ");
  if (ids) input.setAttribute("aria-describedby", ids);
  if (text) input.setAttribute("aria-invalid", "true");
  else input.removeAttribute("aria-invalid");
}

function step(n) {
  for (const s of $$("[data-step]", root)) s.hidden = Number(s.dataset.step) !== n;
  const steps = $(".op-steps", root);
  $(".op-steps__count", steps).textContent = `Шаг ${n} из 3`;
  $$(".op-steps__item", steps).forEach((li, i) => {
    li.classList.toggle("is-done", i + 1 < n);
    li.classList.toggle("is-current", i + 1 === n);
    const s = $(".op-steps__step", li);
    const mark = $(".op-steps__mark", li);
    mark.textContent = i + 1 < n ? "" : String(i + 1);
    if (i + 1 < n) mark.append(iconEl("check"), el("span", "op-visually-hidden", "Готово:"));
    if (i + 1 === n) s.setAttribute("aria-current", "step");
    else s.removeAttribute("aria-current");
  });
  (n === 1 ? $("[data-step='1'] input, [data-step='1'] select", root) : $(`[data-step='${n}'] .ok-step__title`, root))?.focus();
  window.scrollTo({ top: root.offsetTop, behavior: "smooth" });
}

function fillSheet(sheet, r, copy) {
  const put = (slot, blocks) => {
    const box = $(`[data-slot=${slot}]`, sheet);
    box.replaceChildren();
    for (const b of blocks) {
      if (b.excluded) {
        box.append(el("p", "ok-sheet__excluded ok-noprint", EXCLUDED));
        continue;
      }
      box.append(el("p", `ok-sheet__${b.kind || "text"}`, b.text));
      if (b.items) box.append(wrap("ol", ...b.items.map((it) => el("li", null, it))));
    }
  };
  put("head", r.blocks.filter((b) => b.place === "head"));
  put("body", r.blocks.filter((b) => b.place === "body"));
  put("foot", r.blocks.filter((b) => b.place === "foot"));
  $("[data-slot=title]", sheet).textContent = r.title;
  $("[data-slot=receipt]", sheet).hidden = copy !== 2;
  $("[data-slot=copy]", sheet).textContent = copy === 2 ? "Экземпляр заявителя" : "Экземпляр для адресата";
  return sheet;
}

function toCheck(e) {
  e.preventDefault();
  syncRole();
  const values = readValues();
  const r = renderDoc(doc, values, { role, copy: 1 });
  const missing = new Set(r.missing.map((m) => m.id));
  const bad = [];
  for (const w of fieldEls()) {
    if (!roleOk(w)) continue;
    const id = w.dataset.field;
    if (w.dataset.type === "date") {
      const fs = $("[data-date3]", w);
      if (missing.has(id) || (values[id] === "" && $$("input, select", fs).some((i) => i.value.trim()))) {
        if (!readDate3(fs, { notFuture: id !== "signed_at" }).error) continue;
        bad.push(w);
      }
    } else {
      fieldError(w, missing.has(id) ? "Заполните это поле" : "");
      if (missing.has(id)) bad.push(w);
    }
  }
  const sum = $("[data-errsum]", root);
  if (bad.length) {
    const box = statusEl("error", "Ошибка", "Заполните поля, отмеченные ниже:");
    box.querySelector("p").append(wrap("ul", ...bad.map((w) => wrap("li", link(`#${$("input, select, textarea", w).id}`, $("label, legend", w).firstChild.textContent.trim())))));
    sum.replaceChildren(box);
    sum.hidden = false;
    sum.focus();
    return;
  }
  sum.hidden = true;
  result = { values, r };
  const notes = $("[data-notes]", root);
  notes.replaceChildren();
  for (const b of doc.blocks.filter((x) => x.norm_state === "fallback" && x.norm_refs?.length)) {
    const st = statusEl("unverified", "Не проверено", "Ссылка на норму не включена: норма не проверена. ");
    st.querySelector("p").append(link(xurl("pal-norms", `acts/${b.norm_refs[0].split("#")[0]}/`), "Что это за норма"));
    if (holds(b.when, values) && (!b.roles || b.roles.includes(role))) notes.append(st);
  }
  $("[data-preview]", root).replaceChildren(fillSheet(cloneTpl("ok-sheet-tpl"), r, 1));
  step(2);
}

async function toSend() {
  const { values, r } = result;
  await saveToCase(values);
  const to = target || (doc.addressee_kinds || []).find((k) => k !== "none") || null;
  const temp = { id: "tmp0000000", scenario: cs?.scenario || "oral-refusal", events: [{ seq: 1, at: today(), type: "filed", doc: doc.id, to, rule_id: ruleFor() }] };
  due = (await caseState(temp)).deadlines[0] || null;
  const ready = $("[data-ready]", root);
  ready.replaceChildren(statusEl("done", "Готово", `Документ готов. Что дальше: распечатайте и подпишите, отнесите или отправьте ${values.addressee_name ? `адресату (${values.addressee_name})` : "адресату"}, попросите отметку о приёме.${due ? ` Если подадите сегодня, ответ должен прийти до ${dueWords(due.due)}` : ""}`));
  if (due) ready.append(...deadlineStatuses(due, ruleNotes(due, (await kit("pack").catch(() => [{}]))[0]?.rule_notes)));
  $("[data-memo-due]", root).textContent = due ? `Если подадите сегодня, ответ должен прийти до ${dueWords(due.due)}. Точную дату посчитаем в деле по дате подачи` : "";
  const esia = $("[data-esia]", root);
  if (esia) {
    esia.value = r.esiaText;
    const lim = Number(channels.find((c) => c.kind === "esia_form" && c.limit_chars)?.limit_chars || 0);
    $("[data-esia-count]", root).textContent = `${plural(r.chars, "знак", "знака", "знаков")}${lim ? ` из ${lim}` : ""}${lim && r.chars > lim ? ". Текст длиннее, чем принимает форма. Сократите его своими словами" : ""}`;
  }
  $("[data-filed]", root).hidden = !cs;
  $("[data-nocase]", root).hidden = Boolean(cs);
  printLabels();
  step(3);
}

function ruleFor() {
  return ladder.find((e) => e.doc === doc.id && e.rule_id)?.rule_id || null;
}

async function saveToCase(values) {
  const remember = $("[data-remember]", root).checked;
  const personal = new Set(fieldEls().filter((w) => "personal" in w.dataset).map((w) => w.dataset.field));
  if (remember) await setProfile({ role, ...Object.fromEntries(Object.entries(values).filter(([k]) => personal.has(k))) });
  else await setProfile(null);
  if (!cs) return;
  const keep = Object.fromEntries(Object.entries(values).filter(([k]) => remember || !personal.has(k)));
  cs.docs = { ...cs.docs, [doc.id]: { fields: keep, built_at: today() } };
  if (target && values.addressee_name) {
    cs.addressees = { ...cs.addressees, [target]: { ...(cs.addressees?.[target] || {}), name: values.addressee_name.slice(0, 240), ...(values.addressee_address ? { address: values.addressee_address.slice(0, 200) } : {}) } };
  }
  await saveCase(cs);
  persist();
  $("[data-save-hint]", root).hidden = false;
}

function pagesOf(copy) {
  const box = el("div", "ok-measure");
  box.setAttribute("aria-hidden", "true");
  const sheet = fillSheet(cloneTpl("ok-sheet-tpl"), renderDoc(doc, result.values, { role, copy }), copy);
  box.append(sheet);
  document.body.append(box);
  const page = (box.getBoundingClientRect().width * 273) / 186;
  const h = sheet.getBoundingClientRect().height;
  box.remove();
  return Math.max(1, Math.ceil((h - 4) / page));
}

function printLabels() {
  const one = pagesOf(1);
  const two = one + pagesOf(2);
  $("[data-print='2'] span", root).textContent = `Распечатать 2 экземпляра, ${plural(two, "страница", "страницы", "страниц")}`;
  const pdf = $("[data-print='1'] span", root);
  if (pdf) pdf.textContent = `Сохранить документ в PDF, ${plural(one, "страница", "страницы", "страниц")}`;
}

function print(mode) {
  const area = $("[data-sheets]", root);
  const copies = mode === "memo" ? [] : mode === "1" ? [1] : [1, 2];
  if (copies.length) area.replaceChildren(...copies.map((n) => fillSheet(cloneTpl("ok-sheet-tpl"), renderDoc(doc, result.values, { role, copy: n }), n)));
  printWith(mode === "memo" ? "ok-print-memo" : "ok-print-doc", mode === "memo" ? "Как подать" : doc.title);
}

async function prefill(profile) {
  const v = { ...(profile || {}) };
  for (const w of fieldEls()) if (w.dataset.default === "today") v[w.dataset.field] = today();
  if (cs) {
    const kinds = (doc.addressee_kinds || []).filter((k) => k !== "none");
    const missing = missingNodes(cs.region_id, await vend("pal-directory", "addressees"));
    const explicit = NODE_LEVEL[rawTo] ? rawTo : null;
    target = explicit || kinds.find((k) => !missing.includes(k)) || kinds[0] || null;
    Object.assign(v, cs.docs?.[doc.id]?.fields || {});
    const lookup = { regionId: cs.region_id, addressees: await vend("pal-directory", "addressees"), federal: await kit("addressees-federal").catch(() => []), saved: cs.addressees || {} };
    const name = target ? addresseeName(target, lookup) : "";
    if (name && (explicit || !v.addressee_name)) v.addressee_name = name;
    if (explicit) v.addressee_address = cs.addressees?.[target]?.address || "";
    if (cs.device && !v.request && doc.id === "written-answer") v.request = `выдать медицинское изделие (код вида ${cs.device})`;
    const filed = [...cs.events].reverse().find((e) => e.type === "filed");
    const refused = [...cs.events].reverse().find((e) => e.type === "oral_refusal" || e.type === "note" || e.type === "forwarded");
    v.filed_at ??= filed?.at;
    if (filed?.to) v.filed_to ??= addresseeName(filed.to, lookup) || undefined;
    v.reg_number ??= filed?.reg_number || undefined;
    v.refused_at ??= refused?.at;
    setRole(cs.role);
  } else if (profile?.role) setRole(profile.role);
  else setRole(role);
  writeValues(v);
  $("[data-remember]", root).checked = Boolean(profile);
}

function selectedChannel() {
  return $("input[name=filed_channel]:checked", root)?.value || channels[0]?.id || null;
}

async function main() {
  storageNotice(await store(), $("[data-case-line]"));
  const [docs, lad, ch, profile] = await Promise.all([kit("documents"), kit("ladder"), kit("channels"), getProfile()]);
  doc = docs.find((d) => d.id === root.dataset.doc);
  if (!doc) throw new Error("документа нет в пакете");
  ladder = lad;
  channels = ch.filter((c) => (doc.channels || []).includes(c.id));
  const { id } = readParams(["id"]);
  cs = id ? await getCase(id) : null;
  if (cs) {
    const line = $("[data-case-line]", root);
    const p = el("p", null, "Документ для вашего дела. Данные подставлены из дела. ");
    p.append(link(`../../case/#id=${cs.id}`, "Вернуться в дело"));
    line.append(p);
    line.hidden = false;
  }
  await prefill(profile);
  syncRole();
  $$("input[name=role]", root).forEach((r) => r.addEventListener("change", syncRole));
  $("[data-step='1']", root).addEventListener("submit", toCheck);
  for (const b of $$("[data-go]", root)) b.addEventListener("click", () => (b.dataset.go === "3" ? toSend().catch(failPage) : step(Number(b.dataset.go))));
  for (const b of $$("[data-print]", root)) b.addEventListener("click", () => print(b.dataset.print));
  for (const d of $$(".ok-channel", root)) {
    d.addEventListener("toggle", () => {
      const r = d.open && $(`input[name=filed_channel][value="${d.dataset.channel}"]`, root);
      if (r) r.checked = true;
    });
  }
  $("[data-copy-esia]", root)?.addEventListener("click", async () => {
    const ok = await copyText($("[data-esia]", root).value).catch(() => false);
    $("[data-esia-count]", root).textContent = ok ? "Текст скопирован" : "Не получилось скопировать. Выделите текст и скопируйте вручную";
  });
  $("[data-ics]", root).addEventListener("click", () => {
    if (!due) return;
    downloadText(buildIcs([{ uid: `${doc.id}-${due.due}@openpalliative`, date: due.due, summary: "Срок по обращению", description: "Проверьте, пришёл ли ответ", alarmsDaysBefore: [1] }]), "srok.ics", "text/calendar;charset=utf-8");
  });
  $("[data-mark-filed]", root).addEventListener("click", async () => {
    pushEvent(cs, { at: today(), type: "filed", doc: doc.id, to: target, channel: selectedChannel(), rule_id: ruleFor(), reg_number: "" });
    await saveCase(cs);
    location.href = `../../case/#id=${cs.id}`;
  });
  $("[data-sheets]", root).closest(".ok-sheets-wrap").classList.add("ok-screen-hidden");
  showJs();
}

main().catch(failPage);
