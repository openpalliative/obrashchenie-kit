const CHANNEL = { visit: "при встрече", phone: "по телефону", written: "письменно" };

export const TO_NAME = {
  mo_head: "главный врач", mo_vk: "врачебная комиссия", rzn_to: "Росздравнадзор региона", minzdrav_region: "минздрав региона",
  rzn_central: "Росздравнадзор", minzdrav_rf: "Минздрав России", prosecutor: "прокуратура",
};
export const TO_WHERE = { ...TO_NAME, mo_head: "больницу или поликлинику", mo_vk: "больницу или поликлинику", prosecutor: "прокуратуру" };
export const FEDERAL = { rzn_central: "rzn-central", minzdrav_rf: "minzdrav-rf", prosecutor: "genproc" };
export const AGENCY = { rzn_to: "rzn", minzdrav_region: "minzdrav" };

function ru(iso) {
  return iso ? iso.split("-").reverse().join(".") : "";
}

export function eventLabel(ev, { docs = {}, replyTypes = [] } = {}) {
  switch (ev.type) {
    case "oral_refusal": return `Отказали на словах${CHANNEL[ev.channel] ? `, ${CHANNEL[ev.channel]}` : ""}`;
    case "call": return "Звонили или ходили";
    case "filed": {
      const d = docs[ev.doc];
      const what = d ? `Подали ${d.title.toLowerCase()}: ${d.name[0].toLowerCase()}${d.name.slice(1)}` : "Подали документ";
      return TO_NAME[ev.to] ? `${what}. Куда: ${TO_NAME[ev.to]}` : what;
    }
    case "registered": return ev.reg_number ? `Обращение зарегистрировали, номер ${ev.reg_number}` : "Обращение зарегистрировали";
    case "reply": return `Пришёл ответ: ${replyTypes.find((t) => t.id === ev.reply_type)?.label?.toLowerCase() || "без уточнения"}`;
    case "forwarded": return ev.to_respondent ? "Обращение переслали тому, на кого вы жаловались" : "Обращение переслали в другой орган";
    case "extended": return ev.new_due ? `Срок ответа продлили до ${ru(ev.new_due)}` : "Срок ответа продлили";
    case "docs_requested": return "Попросили дополнительные документы";
    case "closed": return "Дело закрыто";
    default: return ev.title || "Заметка";
  }
}

export function sortedEvents(c) {
  return [...(c.events || [])].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : (a.seq || 0) - (b.seq || 0)));
}

export function buildSteps(c, st, ctx = {}) {
  const out = sortedEvents(c).filter((e) => e.type !== "note").map((e) => ({ state: "done", title: eventLabel(e, ctx), date: e.at }));
  const due = st.deadlines[0]?.due || null;
  const docName = ctx.docs?.[ctx.firstDoc]?.name;
  if (st.stage === "prepare") {
    out.push({ state: "current", title: docName ? `Собрать документ: ${docName.toLowerCase()}` : "Собрать документ", date: null });
    out.push({ state: "next", title: "Подать документ в двух экземплярах и попросить отметку о приёме", date: null });
    out.push({ state: "next", title: "Ждать ответ. Дату посчитаем, когда вы отметите подачу", date: null });
  } else if (st.stage === "waiting") {
    out.push({ state: "current", title: "Ждать ответ", date: due, until: true });
    out.push({ state: "next", title: "Если ответа не будет в срок: жалоба на нарушение срока выше", date: null });
  } else if (st.stage === "overdue") {
    out.push({ state: "current", title: "Собрать жалобу на нарушение срока", date: null });
    out.push({ state: "next", title: "Подать жалобу и ждать ответ", date: null });
  } else if (st.stage === "closed") {
    if (c.closed_at && !(c.events || []).some((e) => e.type === "closed")) out.push({ state: "done", title: "Дело закрыто", date: c.closed_at });
  } else if (st.stage === "answered") {
    out.push({ state: "current", title: "Выбрать следующий шаг из вариантов выше или закрыть дело", date: null });
  }
  return out;
}

export function ruleNotes(d, notes = []) {
  if (!d?.rule_id) return [];
  return notes.filter((n) => n.rule_id === d.rule_id && (!d.to || (n.to || []).includes(d.to))).map((n) => n.text);
}

export function nextOverdueTarget(opts) {
  const o = opts.find((x) => x.kind === "complaint" && x.doc === "deadline-complaint") || opts.find((x) => x.kind === "complaint");
  return o ? { to: o.to, where: TO_WHERE[o.to] || "" } : null;
}

export function missingNodes(regionId, addressees) {
  if (!regionId) return [];
  const has = (agency) => addressees.some((a) => a.region_id === regionId && a.agency === agency);
  return Object.entries(AGENCY).filter(([, agency]) => !has(agency)).map(([node]) => node);
}

export function agencyName(name) {
  const m = /^(.*?)\s*\([^()]*(?:центр|ГАУЗ|ГБУЗ|ГКУЗ|отдел|больниц)/u.exec(name);
  return m && m[1] ? m[1].trim() : name;
}

export function addresseeName(to, { regionId = null, addressees = [], federal = [], saved = {} } = {}) {
  if (saved[to]?.name) return saved[to].name;
  if (AGENCY[to]) return agencyName(addressees.find((a) => a.region_id === regionId && a.agency === AGENCY[to])?.name || "");
  if (FEDERAL[to]) return federal.find((f) => f.id === FEDERAL[to])?.label || "";
  return "";
}
