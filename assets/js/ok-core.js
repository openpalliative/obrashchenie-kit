import { todayIso } from "../../ui/js/format.js";
import { readDate3 as read3, setDate3, wireDates } from "../../ui/js/date3.js";

export { setDate3 };

const WEEKDAYS = ["воскресенья", "понедельника", "вторника", "среды", "четверга", "пятницы", "субботы"];
const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
const cache = new Map();

export const today = () => todayIso();
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export function loadJson(path) {
  if (!cache.has(path)) {
    cache.set(path, fetch(new URL(path, import.meta.url)).then((r) => {
      if (!r.ok) throw new Error(path);
      return r.json();
    }));
  }
  return cache.get(path);
}

export const kit = (name) => loadJson(`../../data/v1/${name}.json`).then((e) => e.items);
export const vend = (repo, name) => loadJson(`../../vendor/${repo}/v1/${name}.json`).then((e) => e.items).catch(() => []);

const WEEKDAYS_NOM = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"];

export function dayWords(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${WEEKDAYS_NOM[d.getUTCDay()]}`;
}

export function dueWords(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${WEEKDAYS[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined && text !== null) n.textContent = text;
  return n;
}

export function link(href, text, cls = null) {
  const a = el("a", cls, text);
  a.href = href;
  return a;
}

export function printWith(cls, title) {
  const old = document.title;
  document.body.classList.add(cls);
  document.title = title;
  addEventListener("afterprint", () => { document.title = old; document.body.classList.remove(cls); }, { once: true });
  print();
}

export function wrap(tag, ...children) {
  const n = document.createElement(tag);
  n.append(...children);
  return n;
}

export function iconEl(name) {
  const t = document.getElementById(`ok-icon-${name}`) || document.getElementById(`op-icon-${name}`);
  return t ? t.content.cloneNode(true) : document.createTextNode("");
}

export function statusEl(kind, word, text) {
  const icons = { done: "circle-check", deadline: "clock", error: "triangle-alert", info: "info", unverified: "circle-help", stale: "history" };
  const box = el("div", `op-status op-status--${kind}`);
  box.append(iconEl(icons[kind]));
  const p = el("p");
  p.append(el("strong", "op-status__word", `${word}.`), ` ${text}`);
  box.append(p);
  return box;
}

export function unverifiedInline(text = "Не проверено") {
  const s = el("span", "op-status op-status--unverified op-status--inline");
  s.append(iconEl("circle-help"), el("span", null, text));
  return s;
}

export function cloneTpl(id) {
  return document.getElementById(id).content.firstElementChild.cloneNode(true);
}

export const readDate3 = (fs, { notFuture = true, notBefore = null } = {}) => read3(fs, { max: notFuture ? "today" : "", min: notBefore || "" });

export function guardForms() {
  for (const f of document.querySelectorAll("form")) {
    if ((f.getAttribute("method") || "").toLowerCase() !== "dialog") f.addEventListener("submit", (e) => e.preventDefault());
  }
}

export function failPage(err) {
  console.warn(err);
  for (const n of document.querySelectorAll("[data-js]")) n.hidden = true;
  const box = el("div", "ok-page-error");
  box.setAttribute("role", "alert");
  box.append(statusEl("error", "Ошибка", "Страница не открылась. Обновите её. Данные на устройстве не удалены"));
  const anchor = document.querySelector(".op-page .op-lead") || document.querySelector(".op-page h1");
  anchor?.after(box);
}

export function showJs() {
  for (const n of document.querySelectorAll("[data-nojs]")) n.hidden = true;
  for (const n of document.querySelectorAll("[data-js]")) n.hidden = false;
  wireDates();
}

export function deadlineStatuses(d, notes = []) {
  const out = notes.map((t) => statusEl("info", "Важно", t));
  if (!d.verified) out.push(statusEl("unverified", "Не проверено", "Срок посчитан по тексту закона, который ещё не сверен с официальной публикацией"));
  if (!d.calendar_verified) out.push(statusEl("info", "Важно", `Календарь на ${d.due.slice(0, 4)} год ещё не утверждён. Дата может сдвинуться на несколько дней`));
  if (d.ambiguous) out.push(statusEl("info", "Важно", `Если последний день выпадает на выходной, ответ могут прислать в ближайший рабочий день${d.due_alt ? `, ${dueWords(d.due_alt).replace(/^\S+, /, "")}` : ""}`));
  return out;
}
