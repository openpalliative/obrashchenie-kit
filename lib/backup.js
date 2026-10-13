export const REPO = "obrashchenie-kit";
export const MAX_BYTES = 1024 * 1024;
export const MAX_CASES = 3;
export const SCENARIOS = ["oral-refusal", "no-answer", "vk-refused", "discharge", "forwarded"];
export const ROLES = ["self", "proxy", "guardian", "parent"];
const ID = /^[a-z0-9]{10}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const KEY = /^[a-z][a-z0-9_-]{0,39}$/;
const EVENT_TYPES = ["oral_refusal", "call", "filed", "registered", "reply", "forwarded", "extended", "docs_requested", "note", "closed"];

const fail = (error_ru) => ({ ok: false, cases: [], profile: null, error_ru });
const plain = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const date = (v) => typeof v === "string" && DATE.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
const str = (max) => (v) => typeof v === "string" && v.length <= max;
const re = (rx) => (v) => typeof v === "string" && rx.test(v);
const opt = (check) => (v) => v === null || check(v);
const oneOf = (list) => (v) => list.includes(v);

const CASE = {
  id: re(ID), schema: (v) => v === 1, created_at: date, closed_at: opt(date), updated_at: opt(date), last_due: opt(date),
  scenario: oneOf(SCENARIOS), role: oneOf(ROLES), region_id: opt(re(/^RU-[A-Z]{2,3}$/)),
  respondent_level: (v) => Number.isInteger(v) && v >= 1 && v <= 3, device: opt(re(/^\d{6}$/)),
  nut: opt(re(/^[a-z0-9-]{1,40}$/)), pack_version: opt(str(20)), start_condition: opt(re(/^[a-z_]{1,40}$/)),
};
const EVENT = {
  seq: (v) => Number.isInteger(v) && v >= 1, at: date, type: oneOf(EVENT_TYPES), channel: opt(str(40)), doc: opt(str(40)),
  to: opt(str(40)), reg_number: opt(str(40)), reply_type: opt(str(40)), to_respondent: opt((v) => typeof v === "boolean"),
  new_due: opt(date), note: opt(str(500)), edited_at: opt(date), rule_id: opt(str(40)), title: opt(str(120)),
};

function pick(obj, spec, required) {
  if (!plain(obj) || required.some((k) => !(k in obj))) return null;
  const out = {};
  for (const [k, check] of Object.entries(spec)) {
    if (!(k in obj) || obj[k] === undefined) continue;
    if (!check(obj[k])) return null;
    out[k] = obj[k];
  }
  return out;
}

function fieldValue(id, v, fields) {
  const f = fields[id];
  if (f?.type === "date") return v === "" || date(v);
  return typeof v === "string" && v.length <= (f?.max || 800);
}

function cleanFields(obj, fields, only = null) {
  if (!plain(obj)) return null;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (!KEY.test(k) || (only && !only(k))) continue;
    if (!fieldValue(k, v, fields)) {
      if (only) continue;
      return null;
    }
    out[k] = v;
  }
  return out;
}

function cleanMap(obj, max, fn) {
  if (obj === undefined) return {};
  if (!plain(obj) || Object.keys(obj).length > max) return null;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const item = KEY.test(k) ? fn(v) : null;
    if (!item) return null;
    out[k] = item;
  }
  return out;
}

export function cleanCase(c, { fields = {} } = {}) {
  const out = pick(c, CASE, ["id", "schema", "created_at", "scenario", "role", "events"]);
  if (!out || !Array.isArray(c.events) || c.events.length > 200) return null;
  out.events = c.events.map((e) => pick(e, EVENT, ["seq", "at", "type"]));
  if (out.events.some((e) => !e)) return null;
  out.docs = cleanMap(c.docs, 20, (d) => {
    const f = plain(d) ? cleanFields(d.fields, fields) : null;
    return f && (d.built_at === undefined || d.built_at === null || date(d.built_at)) ? { fields: f, built_at: d.built_at || null } : null;
  });
  out.addressees = cleanMap(c.addressees, 10, (a) => pick(a, { name: str(240), address: str(200) }, ["name"]));
  if (!out.docs || !out.addressees) return null;
  out.closed_at ??= null;
  out.respondent_level ??= 1;
  return out;
}

export const validCase = (c, opts) => Boolean(cleanCase(c, opts));

export function cleanProfile(p, { fields = {} } = {}) {
  if (!plain(p)) return null;
  const out = cleanFields(p, fields, (k) => fields[k]?.personal) || {};
  if (ROLES.includes(p.role)) out.role = p.role;
  return Object.keys(out).some((k) => k !== "role") ? out : null;
}

export function fieldMeta(docs) {
  const out = {};
  for (const d of docs) for (const f of d.fields || []) out[f.id] = { type: f.type, max: Number(f.max_len) || 800, personal: f.personal === true };
  return out;
}

export function stripPersonal(c, fields) {
  const docs = {};
  for (const [k, d] of Object.entries(c.docs || {})) docs[k] = { ...d, fields: Object.fromEntries(Object.entries(d.fields).filter(([id]) => !fields[id]?.personal)) };
  return { ...c, docs };
}

export const hasPersonal = (c, fields) => Object.values(c.docs || {}).some((d) => Object.keys(d.fields || {}).some((id) => fields[id]?.personal));

export function parseBackup(text, { maxBytes = MAX_BYTES, repo = REPO, fields = {} } = {}) {
  const size = typeof text === "string" ? new TextEncoder().encode(text).length : 0;
  if (size > maxBytes) return fail("Файл слишком большой. Файл дел весит меньше 1 МБ");
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return fail("Файл не подошёл: это не файл дел этого инструмента");
  }
  if (!plain(data) || data.format !== "openpalliative-backup/1" || !Array.isArray(data.entries)) {
    return fail("Файл не подошёл: это не файл дел этого инструмента");
  }
  if (data.repo !== repo) return fail("Файл не подошёл: это файл другого инструмента");
  if (data.entries.length > 20) return fail("Файл повреждён: в нём слишком много записей");
  const cases = [];
  let profile = null;
  for (const entry of data.entries) {
    if (!plain(entry) || typeof entry.key !== "string") return fail("Файл повреждён: в нём есть запись без ключа");
    if (entry.key.startsWith("case:")) {
      const c = cleanCase(entry.value, { fields });
      if (!c || entry.key !== `case:${c.id}`) return fail("Файл повреждён: одно из дел записано с ошибкой. Дела на устройстве не изменились");
      cases.push(c);
    } else if (entry.key === "profile") {
      profile = cleanProfile(entry.value, { fields });
    }
  }
  if (!cases.length) return fail("В файле нет дел");
  if (cases.length > MAX_CASES) return fail(`В файле ${cases.length} дел. На одном устройстве помещается не больше ${MAX_CASES}`);
  return { ok: true, cases, profile, error_ru: null };
}
