import { $, link, kit, vend, today, el, cloneTpl, showJs, guardForms, failPage, readDate3, setDate3 } from "./ok-core.js";
import { readParams } from "../../ui/js/xparams.js";
import { showDate3Error } from "../../ui/js/date3.js";
import { ruDate } from "../../ui/js/format.js";
import { options } from "../../lib/ladder.js";

guardForms();

const form = $(".ok-answer__form");
const AS_EVENT = { forwarded: { type: "forwarded", to_respondent: false }, forwarded_other: { type: "forwarded", to_respondent: false }, forwarded_to_respondent: { type: "forwarded", to_respondent: true }, docs_requested: { type: "docs_requested" } };
let types = [];
let ladder = [];
let docs = {};
let cs = null;
let level = null;
let missing = [];
let filedAt = null;
let db = null;

function render() {
  const id = form.reply.value;
  const t = types.find((x) => x.id === id);
  const box = $("[data-result]");
  if (!t) {
    box.hidden = true;
    return;
  }
  const opts = options(t.condition, level || Number(form.level.value), ladder, { missing });
  $("[data-meaning]").textContent = t.meaning;
  $("[data-optlist]").replaceChildren(...opts.slice(0, 5).map((o) => {
    const li = cloneTpl("ok-option-item");
    li.querySelector(".ok-opt__label").textContent = o.label;
    li.querySelector(".ok-opt__to").textContent = o.hint || "";
    const a = li.querySelector(".ok-opt__btn");
    if (o.doc && docs[o.doc]) a.href = `../docs/${o.doc}/${cs ? `#id=${cs.id}${o.to && o.to !== "none" ? `&to=${o.to}` : ""}` : ""}`;
    else a.remove();
    return li;
  }));
  if (!opts.length) $("[data-optlist]").append(el("li", "ok-opt", "Дело можно закрыть. Сохраните ответ вместе с вашим экземпляром обращения"));
  $("[data-save-wrap]").hidden = !cs || id === "none";
  $("[data-live]").textContent = "";
  box.hidden = false;
}

function readAt() {
  const fs = $("#ok-ans-at");
  const r = readDate3(fs);
  if (r.error) return null;
  if (filedAt && r.iso < filedAt) {
    showDate3Error(fs, `Ответ не может прийти раньше, чем вы подали обращение (${ruDate(filedAt)})`);
    return null;
  }
  return r.iso;
}

async function save() {
  const id = form.reply.value;
  const at = readAt();
  if (!at) return $("#ok-ans-at input").focus();
  db.pushEvent(cs, { at, ...(AS_EVENT[id] || { type: "reply", reply_type: id }) });
  if (id === "resolved") cs.closed_at = at;
  await db.saveCase(cs);
  const a = link(`../case/#id=${cs.id}`, "Вернуться в дело");
  $("[data-live]").replaceChildren(id === "extended" ? "Записано. Впишите новую дату ответа в журнале дела. " : "Записано в дело. ", a);
  $("[data-save-wrap]").hidden = true;
}

function onChange(e) {
  if (!types.length || !e.target.name || e.target.closest("[data-date3]")) return;
  const main = e.target.closest(".ok-big");
  if (e.target.name === "reply" && main) {
    const more = $("[data-more]");
    more.open = types.some((t) => t.parent === e.target.value);
    for (const l of more.querySelectorAll("[data-parent]")) l.hidden = l.dataset.parent !== e.target.value;
  }
  render();
  if (e.target.name === "reply" && (!main || !$("[data-more]").open)) $("[data-result]").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function main() {
  const [t, l, d] = await Promise.all([kit("reply-types"), kit("ladder"), kit("documents")]);
  types = t;
  ladder = l;
  docs = Object.fromEntries(d.map((x) => [x.id, x]));
  const p = readParams(["id", "from"]);
  if (p.id) {
    const [store, state, view] = await Promise.all([import("./ok-store.js"), import("./ok-state.js"), import("../../lib/case-view.js")]);
    db = store;
    cs = await store.getCase(p.id);
    if (cs) {
      level = (await state.caseState(cs)).level;
      missing = view.missingNodes(cs.region_id, await vend("pal-directory", "addressees"));
    }
  }
  if (cs) {
    filedAt = [...cs.events].filter((e) => e.type === "filed").map((e) => e.at).sort().pop() || null;
    $("[data-level-q]").hidden = true;
    const line = $("[data-case-line]");
    const para = el("p", null, "Ответ по вашему делу. ");
    para.append(link(`../case/#id=${cs.id}`, "Вернуться в дело"));
    line.append(para);
    line.hidden = false;
    setDate3($("#ok-ans-at"), p.from && (!filedAt || p.from >= filedAt) ? p.from : today());
  }
  form.addEventListener("change", onChange);
  $("[data-save]").addEventListener("click", () => save().catch(failPage));
  showJs();
  const picked = form.querySelector("input[name=reply]:checked");
  if (picked) onChange({ target: picked });
}

main().catch(failPage);
