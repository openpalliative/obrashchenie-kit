const DAY = 86400000;
const parse = (s) => new Date(`${s}T00:00:00Z`);
const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (s, n) => iso(new Date(parse(s).getTime() + n * DAY));
const yearOf = (s) => Number(s.slice(0, 4));
const isWeekend = (s) => [0, 6].includes(parse(s).getUTCDay());
const cache = new WeakMap();

function index(calendar) {
  const key = calendar && typeof calendar === "object" ? calendar : null;
  if (key && cache.has(key)) return cache.get(key);
  const items = Array.isArray(calendar) ? calendar : calendar?.items ?? [];
  const base = items.find((i) => i.kind === "baseline") ?? { holidays_mmdd: [], carry_exclude_mmdd: [], carry_over: false };
  const years = new Map(items.filter((i) => i.kind === "year").map((i) => [i.year, i]));
  const idx = { base, years, sets: new Map() };
  if (key) cache.set(key, idx);
  return idx;
}

function baselineYear(base, year) {
  const pad = (m) => `${year}-${m}`;
  const hol = new Set(base.holidays_mmdd.map(pad));
  const excl = new Set(base.carry_exclude_mmdd.map(pad));
  const off = new Set(hol);
  if (base.carry_over) {
    for (const h of [...hol].sort()) {
      if (!isWeekend(h) || excl.has(h)) continue;
      let d = addDays(h, 1);
      while (isWeekend(d) || off.has(d)) d = addDays(d, 1);
      off.add(d);
    }
  }
  return { off, work: new Set(), verified: false };
}

function yearSets(idx, year) {
  if (!idx.sets.has(year)) {
    const y = idx.years.get(year);
    idx.sets.set(year, y?.off
      ? { off: new Set(y.off), work: new Set(y.work ?? []), verified: y.verified === true }
      : baselineYear(idx.base, year));
  }
  return idx.sets.get(year);
}

export function isWorkingDay(s, calendar) {
  const ys = yearSets(index(calendar), yearOf(s));
  const working = ys.work.has(s) || (!isWeekend(s) && !ys.off.has(s));
  return { working, verified: ys.verified };
}

export function addWorkingDays(s, n, calendar) {
  let d = s;
  let left = Math.abs(n);
  const step = n < 0 ? -1 : 1;
  while (left > 0) {
    d = addDays(d, step);
    if (isWorkingDay(d, calendar).working) left -= 1;
  }
  return d;
}

function nextWorkingDay(s, calendar) {
  let d = s;
  while (!isWorkingDay(d, calendar).working) d = addDays(d, 1);
  return d;
}

export function nonWorkingDays(fromIso, toIso, calendar) {
  const out = [];
  for (let d = fromIso; d <= toIso; d = addDays(d, 1)) {
    const ys = yearSets(index(calendar), yearOf(d));
    if (ys.work.has(d)) continue;
    if (ys.off.has(d)) out.push({ date: d, kind: "holiday" });
    else if (isWeekend(d)) out.push({ date: d, kind: "weekend" });
  }
  return out;
}

export function calendarYears(calendar) {
  const out = {};
  for (const [year, y] of index(calendar).years) out[year] = { verified: y.verified === true };
  return out;
}

function yearsVerified(a, b, calendar) {
  const idx = index(calendar);
  const [lo, hi] = a < b ? [a, b] : [b, a];
  for (let y = yearOf(lo); y <= yearOf(hi); y += 1) {
    if (!yearSets(idx, y).verified) return false;
  }
  return true;
}

function plural(n, one, few, many) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

function unitText(value, unit) {
  if (unit === "within_24h") return "в течение суток";
  if (unit === "working_days") return `${value} ${plural(value, "рабочий день", "рабочих дня", "рабочих дней")}`;
  return `${value} ${plural(value, "день", "дня", "дней")}`;
}

function addUnit(d, value, unit, calendar) {
  if (unit === "within_24h") return addDays(d, 1);
  if (unit === "working_days") return addWorkingDays(d, value, calendar);
  return addDays(d, value);
}

export function computeDeadline({ rule, start, calendar }) {
  const steps = [];
  let due;
  let dueAlt = null;
  let marginApplied = 0;
  let formula;
  if (rule.direction === "backward") {
    let d = start;
    let count = 0;
    while (count < rule.value) {
      d = addDays(d, -1);
      if (isWorkingDay(d, calendar).working) count += 1;
    }
    steps.push({ label: unitText(rule.value, rule.unit), date: d });
    if (!yearsVerified(d, start, calendar) && rule.margin_working_days > 0) {
      marginApplied = rule.margin_working_days;
      d = addWorkingDays(d, -marginApplied, calendar);
      steps.push({ label: `запас ${unitText(marginApplied, "working_days")}`, date: d });
    }
    due = d;
    formula = `${unitText(rule.value, rule.unit)} до даты: ${rule.from_event_label.toLowerCase()}`;
  } else {
    let d = start;
    const parts = [];
    if (rule.pre) {
      d = addUnit(d, rule.pre.value, rule.pre.unit, calendar);
      steps.push({ label: rule.pre.label, date: d });
      parts.push(`${unitText(rule.pre.value, rule.pre.unit)} ${rule.pre.label}`);
    }
    d = addUnit(d, rule.value, rule.unit, calendar);
    steps.push({ label: unitText(rule.value, rule.unit), date: d });
    parts.push(rule.pre ? `ещё ${unitText(rule.value, rule.unit)}` : unitText(rule.value, rule.unit));
    due = d;
    if (!isWorkingDay(due, calendar).working) {
      const next = nextWorkingDay(due, calendar);
      if (rule.shift_if_nonworking === "yes") due = next;
      else if (rule.shift_if_nonworking === "unknown") dueAlt = next;
    }
    formula = parts.join(", ");
  }
  const latest = dueAlt && dueAlt > due ? dueAlt : due;
  return {
    rule_id: rule.id,
    due,
    due_alt: dueAlt,
    latest,
    formula,
    steps,
    norm_ids: rule.norm_ids ?? [],
    ambiguous: rule.ambiguous === true,
    verified: rule.verified === true,
    calendar_verified: yearsVerified(start, latest, calendar),
    margin_applied: marginApplied,
  };
}
