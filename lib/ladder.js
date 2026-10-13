export const NODE_LEVEL = { mo_head: 1, mo_vk: 1, rzn_to: 2, minzdrav_region: 2, prosecutor: 2, rzn_central: 3, minzdrav_rf: 3 };

export function splitLadder(ladder) {
  const items = Array.isArray(ladder) ? ladder : ladder?.items || [];
  const nodes = new Map();
  const edges = [];
  for (const it of items) {
    if (it.kind === "node" || (it.level !== undefined && !it.from_condition)) nodes.set(it.id, it);
    else if (it.from_condition) edges.push(it);
  }
  for (const n of ladder?.nodes || []) nodes.set(n.id, n);
  return { nodes, edges };
}

export function levelOf(nodeId, nodes) {
  const n = nodes?.get?.(nodeId);
  return Number(n?.level ?? NODE_LEVEL[nodeId] ?? 0);
}

export function options(condition, respondentLevel, ladder, { missing = [] } = {}) {
  const { nodes, edges } = splitLadder(ladder);
  const level = Number(respondentLevel) || 0;
  const seen = new Set();
  const out = [];
  for (const e of edges) {
    if (e.from_condition !== condition || missing.includes(e.to)) continue;
    const rl = Number(e.respondent_level || 0);
    if (rl && rl !== level) continue;
    const toLevel = Number(e.to_level ?? levelOf(e.to, nodes));
    const free = e.kind === "request" || e.to === "prosecutor" || (e.to_branch || nodes.get(e.to)?.branch) === "prosecutor";
    if (!free && level && toLevel && toLevel <= level) continue;
    const key = `${e.doc}|${e.to}|${e.label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ edge_id: e.id, kind: e.kind || "complaint", hint: e.hint || "", doc: e.doc || null, to: e.to, to_level: toLevel, label: e.label, rule_id: e.rule_id || null, norm_refs: e.norm_refs || [] });
  }
  return out;
}
