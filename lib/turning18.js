import { addWorkingDays, makeCalendar } from "./workdays.js";

export function birthday18(birthDate) {
  const [y, m, d] = birthDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y + 18, m - 1, d));
  return dt.toISOString().slice(0, 10);
}

function minusMonths(iso, months) {
  const [y, m, d] = iso.split("-").map(Number);
  const last = new Date(Date.UTC(y, m - 1 - months + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1 - months, Math.min(d, last))).toISOString().slice(0, 10);
}

const wd = (n) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? "рабочий день" : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? "рабочих дня" : "рабочих дней"}`;

function backward(rule, item, start, calendar, computeDeadline, cal) {
  const n = Number(item.offset ?? rule?.value ?? 0);
  let r = null;
  if (rule && computeDeadline && rule.direction === "backward") {
    try { r = computeDeadline({ rule, start, calendar }); } catch { r = null; }
  }
  const own = addWorkingDays(start, -n, cal);
  const due = r?.due && r.due <= start ? r.due : own.date;
  const calOk = (r?.calendar_verified ?? own.calendar_verified) !== false && own.calendar_verified;
  const margin = Number(item.margin_wd ?? rule?.margin_working_days ?? 0);
  const marginDate = margin ? addWorkingDays(due, -margin, cal).date : null;
  const formula = `За ${wd(n)} до дня, когда исполнится 18, по производственному календарю${marginDate ? `. Запас ${wd(margin)}` : ""}`;
  return { date: due, margin_date: marginDate, formula, calendar_verified: calOk, rule_verified: rule ? rule.verified === true : false };
}

export function turning18(birthDate, { items, rules = [], calendar, computeDeadline } = {}) {
  const b18 = birthday18(birthDate);
  const cal = makeCalendar(calendar);
  const ruleById = new Map(rules.map((r) => [r.id, r]));
  const out = [];
  for (const it of items) {
    const base = { id: it.id, kind: it.kind, label: it.label, text: it.text || "", norm_refs: it.norm_refs || [] };
    if (it.kind === "fact") {
      out.push({ ...base, date: b18, margin_date: null, formula: "День, когда исполнится 18", verified: true, calendar_verified: true });
    } else if (it.unit === "months") {
      const n = Number(it.offset);
      out.push({ ...base, date: minusMonths(b18, n), margin_date: null, formula: `За ${n} мес. до дня, когда исполнится 18`, verified: it.verified === true, calendar_verified: true });
    } else {
      const rule = it.rule_id ? ruleById.get(it.rule_id) : null;
      if (!rule && !it.offset) {
        out.push({ ...base, date: null, margin_date: null, formula: "", verified: false, calendar_verified: true, rule_missing: true });
        continue;
      }
      const r = backward(rule, it, b18, calendar, computeDeadline, cal);
      out.push({ ...base, date: r.date, margin_date: r.margin_date, formula: r.formula, verified: it.verified === true && (rule ? r.rule_verified : true), calendar_verified: r.calendar_verified, rule_missing: Boolean(it.rule_id && !rule) });
    }
  }
  const key = (r) => r.margin_date || r.date || "9999";
  return out.sort((a, b) => key(a).localeCompare(key(b)));
}
