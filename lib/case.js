import { NODE_LEVEL } from "./ladder.js";

export const START_CONDITION = {
  "oral-refusal": "oral_refusal", "vk-refused": "vk_refused", "no-answer": "no_answer",
  discharge: "discharge_planned", forwarded: "forwarded_to_respondent",
};
export const DOC_RULE = { "vk-extract": "180n-protocol-extract", "med-records": "789n-copies" };
export const ANSWER_RULE = "59fz-answer";

function byDate(a, b) {
  return a.at < b.at ? -1 : a.at > b.at ? 1 : (a.seq || 0) - (b.seq || 0);
}

function conditionOfReply(type, replyTypes) {
  const t = replyTypes.find((r) => r.id === type);
  return t?.condition || (type === "unknown" ? "answer_not_on_merits" : null);
}

function computeFor(p, rules, calendar, computeDeadline, today) {
  if (p.extended) {
    return { id: "answer", rule_id: null, due: p.extended, due_alt: null, latest: p.extended, formula: "Срок продлили. Новую дату вы вписали из письма", ambiguous: false, calendar_verified: true, verified: true, user_entered: true, overdue: today > p.extended, steps: [] };
  }
  const byId = new Map(rules.map((r) => [r.id, r]));
  let rule = byId.get(p.rule_id) || byId.get(ANSWER_RULE);
  if (!rule) return null;
  let start = p.start;
  let note = "";
  if (p.registered && rule.pre) {
    rule = { ...rule, pre: null };
    start = p.registered;
    note = "Считаем от даты регистрации, которую вы вписали";
  }
  const r = computeDeadline({ rule, start, calendar });
  const latest = r.latest || r.due_alt || r.due;
  return {
    id: "answer", rule_id: rule.id, start, due: r.due, due_alt: r.due_alt || null, latest, formula: r.formula || "", note,
    ambiguous: Boolean(r.ambiguous || rule.ambiguous), calendar_verified: r.calendar_verified !== false,
    verified: rule.verified === true && r.verified !== false, overdue: today > latest, steps: r.steps || [],
  };
}

export function reduceCase(c, { rules = [], calendar, computeDeadline, today, replyTypes = [] }) {
  const events = [...(c.events || [])].sort(byDate);
  let stage = "prepare";
  let condition = c.start_condition || START_CONDITION[c.scenario] || null;
  let pending = null;
  let lastReply = null;
  let lastTo = null;
  for (const ev of events) {
    if (ev.type === "oral_refusal" || ev.type === "call") {
      condition = "oral_refusal";
      if (stage === "answered") stage = "prepare";
    } else if (ev.type === "filed") {
      pending = { start: ev.at, rule_id: ev.rule_id || DOC_RULE[ev.doc] || ANSWER_RULE, registered: null, extended: null, to: ev.to || null, doc: ev.doc || null };
      stage = "waiting";
      condition = null;
      if (NODE_LEVEL[ev.to]) lastTo = ev.to;
    } else if (ev.type === "registered" && pending) {
      pending.registered = ev.at;
    } else if (ev.type === "forwarded" && ev.to_respondent) {
      condition = "forwarded_to_respondent";
      pending = null;
      stage = "answered";
    } else if (ev.type === "forwarded") {
      condition = "forwarded_other";
      if (pending) pending = { ...pending, start: ev.at, rule_id: ANSWER_RULE, registered: null, extended: null };
    } else if (ev.type === "extended" && pending) {
      pending.extended = ev.new_due || null;
      condition = "extended";
    } else if (ev.type === "docs_requested") {
      condition = "docs_requested";
    } else if (ev.type === "reply") {
      stage = "answered";
      condition = conditionOfReply(ev.reply_type, replyTypes);
      lastReply = ev;
      pending = null;
    } else if (ev.type === "closed") {
      stage = "closed";
    }
  }
  if (c.closed_at) stage = "closed";
  const deadlines = [];
  let next = null;
  if (pending && stage !== "closed") {
    const d = computeFor(pending, rules, calendar, computeDeadline, today);
    if (d) {
      d.to = pending.to;
      deadlines.push(d);
      if (d.overdue) {
        stage = "overdue";
        condition = "deadline_passed";
        next = { doc: "deadline-complaint", condition, label: "Собрать жалобу на нарушение срока" };
      }
    }
  }
  if (stage === "waiting") condition = "no_answer_waiting";
  if (c.scenario === "no-answer" && !pending && stage === "prepare") condition = "no_answer";
  const changed = deadlines[0] && c.last_due && c.last_due !== deadlines[0].latest ? { from: c.last_due, to: deadlines[0].latest } : null;
  const level = lastTo ? NODE_LEVEL[lastTo] : Number(c.respondent_level) || 1;
  return { stage, deadlines, next, conditions: condition ? [condition] : [], last_reply: lastReply, changed, level, last_to: lastTo };
}
