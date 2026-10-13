const DAY = 86400000;

export function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  return new Date(d.getTime() + n * DAY).toISOString().slice(0, 10);
}

function index(calendar) {
  const items = calendar?.items || calendar || [];
  const years = new Map();
  let baseline = null;
  for (const it of items) {
    if (it.kind === "baseline" || it.id === "baseline") baseline = it;
    else if (it.year) years.set(Number(it.year), { off: new Set(it.off || []), work: new Set(it.work || []), verified: it.verified === true });
  }
  return { years, baseline, cache: new Map() };
}

function baselineYear(idx, year) {
  if (idx.cache.has(year)) return idx.cache.get(year);
  const off = new Set();
  const b = idx.baseline || { holidays_mmdd: [], carry_exclude_mmdd: [] };
  for (const mmdd of b.holidays_mmdd || []) off.add(`${year}-${mmdd}`);
  if (b.carry_over) {
    for (const mmdd of b.holidays_mmdd || []) {
      if ((b.carry_exclude_mmdd || []).includes(mmdd)) continue;
      let iso = `${year}-${mmdd}`;
      if (!isWeekend(iso)) continue;
      do iso = addDays(iso, 1); while (isWeekend(iso) || off.has(iso));
      off.add(iso);
    }
  }
  const y = { off, work: new Set(), verified: false };
  idx.cache.set(year, y);
  return y;
}

function isWeekend(iso) {
  const wd = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return wd === 0 || wd === 6;
}

function yearOf(idx, iso) {
  const year = Number(iso.slice(0, 4));
  return idx.years.get(year) || baselineYear(idx, year);
}

export function makeCalendar(calendar) {
  const idx = index(calendar);
  const isWorking = (iso) => {
    const y = yearOf(idx, iso);
    if (y.work.has(iso)) return true;
    return !y.off.has(iso) && !isWeekend(iso);
  };
  const verified = (iso) => yearOf(idx, iso).verified;
  return { isWorking, verified };
}

export function addWorkingDays(iso, n, calendar) {
  const cal = calendar?.isWorking ? calendar : makeCalendar(calendar);
  const step = n < 0 ? -1 : 1;
  let left = Math.abs(n);
  let date = iso;
  let ok = cal.verified(iso);
  while (left > 0) {
    date = addDays(date, step);
    ok = ok && cal.verified(date);
    if (cal.isWorking(date)) left -= 1;
  }
  return { date, calendar_verified: ok };
}
