const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
const PH = /\{\{\s*([a-z_]+)(?::([A-Za-z0-9_#-]+))?\s*\}\}/g;
export const BLANK = "____________";
export const EXCLUDED = "Пункт не проверен и в документ не включён";
const SAFE_STATES = new Set([undefined, null, "ok", "none", "fallback"]);

export function dateWords(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]} г.` : "";
}

export function fillText(text, values, { addressee = "", fields = {} } = {}) {
  const unknown = [];
  const empty = [];
  const out = String(text).replace(PH, (all, key, arg) => {
    if (key === "addressee") return addressee || BLANK;
    if (key === "date" && arg) {
      if (!(arg in fields)) { unknown.push(all); return ""; }
      const v = dateWords(values[arg]);
      if (!v) empty.push(arg);
      return v || BLANK;
    }
    if (key === "norm" || arg !== undefined || !(key in fields)) { unknown.push(all); return ""; }
    const raw = values[key];
    const v = fields[key].type === "date" ? dateWords(raw) : String(raw ?? "").trim();
    if (!v) empty.push(key);
    return v || BLANK;
  });
  return { text: out.replace(/([^.])\.\.(?!\.)/g, "$1."), unknown, empty };
}

export function holds(cond, values) {
  if (!cond) return true;
  const neg = cond.startsWith("!");
  const [key, want] = cond.replace(/^!/, "").split("=");
  const v = String(values[key] ?? "").trim();
  const ok = want === undefined ? Boolean(v) : v === want;
  return neg ? !ok : ok;
}

function applies(item, role, values) {
  if (item.roles && item.roles.length && !item.roles.includes(role)) return false;
  return holds(item.when, values);
}

export function docFields(doc, role) {
  return (doc.fields || []).filter((f) => applies({ roles: f.roles }, role, {}));
}

export function renderDoc(doc, values = {}, { role = "self", addressee = "", copy = 1 } = {}) {
  const fieldList = docFields(doc, role);
  const fields = Object.fromEntries((doc.fields || []).map((f) => [f.id, f]));
  const missing = fieldList.filter((f) => (f.required || (f.required_if && holds(f.required_if, values))) && !String(values[f.id] ?? "").trim()).map((f) => ({ id: f.id, label: f.label }));
  const blocks = [];
  for (const b of doc.blocks || []) {
    if (!applies(b, role, values)) continue;
    if (!SAFE_STATES.has(b.norm_state)) {
      blocks.push({ id: b.id, text: EXCLUDED, excluded: true, place: b.place || "body", reason: b.norm_reason || b.norm_state });
      continue;
    }
    const source = b.text ?? b.fallback;
    if (source == null || source === "") throw new Error(`В блоке ${b.id} нет текста`);
    const r = fillText(source, values, { addressee, fields });
    if (r.unknown.length) blocks.push({ id: b.id, text: EXCLUDED, excluded: true, place: b.place || "body", reason: "unknown_placeholder" });
    else {
      const out = { id: b.id, text: r.text, kind: b.kind || "text", place: b.place || "body", fallback: b.norm_state === "fallback" };
      if (b.kind === "list") out.items = String(values[b.list_field] ?? "").split("\n").map((x) => x.trim()).filter(Boolean);
      blocks.push(out);
    }
  }
  const esia = doc.esia_summary ? fillText(doc.esia_summary, values, { addressee, fields }) : { text: "", unknown: [] };
  const esiaText = esia.unknown.length ? "" : esia.text;
  return { title: doc.title, blocks, missing, esiaText, chars: [...esiaText].length, receipt: copy === 2 && doc.receipt_block === true, copy };
}
