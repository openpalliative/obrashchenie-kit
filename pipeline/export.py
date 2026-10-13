import datetime as dt
from pathlib import Path

from opsite.data import BuildError, coerce, make_envelope, validate

from . import pack_lint, resolve, source, vendor

REPO = "obrashchenie-kit"
LICENSE = "CC-BY-SA-4.0"
STALE = 365
NEIGHBOR_URL = "https://openpalliative.github.io/{repo}/data/v1/{name}.json"


def _today() -> dt.date:
    return dt.date.today()


def _sources(all_sources: dict, rows: list[dict], extra: list[dict] | None = None) -> list[dict]:
    ids = []
    for r in rows:
        ref = r.get("source_ref")
        if ref and ref not in ids:
            ids.append(ref)
    out = []
    for ref in ids:
        if ref not in all_sources:
            raise BuildError(f"data/sources.yaml: нет источника {ref}")
        out.append({k: v for k, v in all_sources[ref].items() if v not in ("", None)})
    return out + (extra or [])


def _neighbor_source(v: dict, repo: str, name: str) -> list[dict]:
    env = v.get(repo, {}).get(name)
    if not env:
        return []
    tag = "тестовый снимок" if vendor.is_fixture(env) else "снимок"
    return [{"id": f"{repo}-{name}", "title": f"{repo}: {name}, {tag} версии {env['version']}, данные от {env['data_date']}",
             "url": NEIGHBOR_URL.format(repo=repo, name=name), "retrieved_at": env["data_date"]}]


def _check(root: Path, name: str, rows: list[dict], where: str) -> list[dict]:
    schema = source.item_schema(root, name)
    out = []
    for i, r in enumerate(rows):
        c = coerce(r, schema)
        validate(c, schema, f"{where}, запись {i + 1} ({r.get('id', '?')})")
        out.append(c)
    return out


def documents(root: Path, pack: dict, acts: dict, today: dt.date) -> list[dict]:
    out = []
    for d in pack["documents"]:
        blocks = [resolve.resolve_block(b, acts, today) for b in d["blocks"]]
        doc = {k: v for k, v in d.items() if not k.startswith("_")}
        doc["blocks"] = blocks
        doc["norm_state"] = resolve.doc_norm_state(blocks)
        doc["maturity"] = "demo" if pack["meta"].get("status") != "reviewed" else "beta"
        out.append(doc)
    rows = _check(root, "documents", out, "data/pack/documents")
    return sorted(rows, key=lambda d: d["order"])


def ladder(root: Path, pack: dict) -> list[dict]:
    nodes = {n["id"]: n for n in pack["nodes"]}
    rows = []
    for e in pack["edges"]:
        n = nodes.get(e["to"], {})
        rows.append({**e, "doc": e.get("doc") or None, "rule_id": e.get("rule_id") or None,
                     "to_label": n.get("label", ""), "to_level": n.get("level") or None,
                     "to_branch": n.get("branch") or None, "to_source": n.get("addressee_source", "")})
    return _check(root, "ladder", rows, "data/pack/graph.yaml")


def reply_types(root: Path, pack: dict) -> list[dict]:
    meta = pack["reply_types_meta"]
    rows = [{**r, "parent": r.get("parent") or None, "verified": meta.get("verified", "false"),
             "verified_at": meta.get("verified_at", ""), "source_ref": meta.get("source_ref", "ok-pack")}
            for r in pack["reply-types"]]
    return sorted(_check(root, "reply-types", rows, "data/pack/reply-types.yaml"), key=lambda r: r["order"])


def turning18(root: Path, pack: dict) -> list[dict]:
    rows = [{**r, "offset": r.get("offset", ""), "unit": r.get("unit") or None, "rule_id": r.get("rule_id") or None}
            for r in pack["turning18"]]
    return sorted(_check(root, "turning18", rows, "data/pack/turning18.yaml"), key=lambda r: r["order"])


def channels(root: Path, pack: dict) -> list[dict]:
    rows = [{**r, "url": r.get("url") or None} for r in pack["channels"]]
    return _check(root, "channels", rows, "data/pack/channels.yaml")


def scenarios(root: Path, rows: list[dict]) -> list[dict]:
    rows = [{"slug": r["id"], **r} for r in rows]
    return sorted(_check(root, "scenarios", rows, "data/scenarios.yaml"), key=lambda r: r["order"])


def unverified(pack_rows: dict, v: dict, used_acts: set, used_rules: set) -> list[dict]:
    out = []
    acts = {a["id"]: a for a in vendor.items(v, "pal-norms", "acts")}
    for act_id in sorted(used_acts):
        a = acts.get(act_id)
        if a is None:
            out.append({"dataset": "acts", "id": act_id, "label": act_id, "why": "нормы нет в снимке pal-norms"})
        elif a.get("verified") is not True or a.get("status") != "in_force":
            why = "текст не сверен с официальной публикацией" if a.get("status") == "in_force" else "норма не действует"
            out.append({"dataset": "acts", "id": act_id, "label": a.get("short_title") or a["title"], "why": why})
    rules = {r["id"]: r for r in vendor.items(v, "pal-norms", "deadline-rules")}
    for rid in sorted(used_rules):
        r = rules.get(rid)
        if r is None:
            out.append({"dataset": "deadline-rules", "id": rid, "label": rid, "why": "правила нет в снимке pal-norms"})
        elif r.get("verified") is not True:
            out.append({"dataset": "deadline-rules", "id": rid, "label": r["situation"],
                        "why": "срок не сверен с официальной публикацией"})
    for r in pack_rows["channels"]:
        if r["verified"] is not True:
            why = ("порядок подачи описан проектом, юрист в РФ его не проверял" if r["kind"] == "paper"
                   else "ограничения формы взяты из исследования, сайт ведомства проект не открывает")
            out.append({"dataset": "channels", "id": r["id"], "label": r["label"], "why": why})
    for r in pack_rows["addressees-federal"]:
        if r["verified"] is not True:
            out.append({"dataset": "addressees-federal", "id": r["id"], "label": r["label"],
                        "why": "ссылка и способ подачи взяты из исследования, сайт ведомства проект не открывает"})
    for r in pack_rows["turning18"]:
        if r["verified"] is not True:
            why = ("ориентир семей, а не срок из закона" if r["kind"] == "family_orientir"
                   else "текст нормы не сверен с официальной публикацией")
            out.append({"dataset": "turning18", "id": r["id"], "label": r["label"], "why": why})
    for r in pack_rows["scenarios"]:
        if r["verified"] is not True:
            out.append({"dataset": "scenarios", "id": r["id"], "label": r["title"],
                        "why": "текст сценария написал проект, юрист в РФ его не проверял"})
    regions = vendor.items(v, "pal-directory", "regions")
    rzn = {a["region_id"] for a in vendor.items(v, "pal-directory", "addressees") if a.get("agency") == "rzn"}
    no_rzn = [r["name"] for r in regions if r["id"] not in rzn]
    if regions and no_rzn:
        out.append({"dataset": "addressees", "id": "rzn-missing",
                    "label": "Территориального органа Росздравнадзора нет в данных РЗН: " + ", ".join(no_rzn),
                    "why": "в открытых данных Росздравнадзора для этих регионов нет территориального органа, "
                           "жалоба на срок идёт в минздрав региона или выше"})
    lines = vendor.items(v, "pal-directory", "region-lines")
    bad = [x for x in lines if x.get("verified") is not True]
    if bad:
        synth = sum(1 for x in bad if x.get("origin") == "synthetic")
        why = (f"номеров не проверено: {len(bad)}, из них выдуманных для примера: {synth}" if synth
               else f"номеров не проверено звонком: {len(bad)}")
        out.append({"dataset": "region-lines", "id": "region-lines", "label": "Номера ведомств по регионам", "why": why})
    return out


def neighbors(v: dict) -> list[dict]:
    out = []
    for repo, envs in sorted(v.items()):
        for name, env in sorted(envs.items()):
            out.append({"repo": repo, "dataset": name, "version": env["version"], "data_date": env["data_date"],
                        "fixture": vendor.is_fixture(env)})
    return out


def build_all(root: Path, today: dt.date | None = None, v: dict | None = None) -> dict:
    today = today or _today()
    root = Path(root)
    v = vendor.load(root) if v is None else v
    acts = {a["id"]: a for a in vendor.items(v, "pal-norms", "acts")}
    rule_ids = {r["id"] for r in vendor.items(v, "pal-norms", "deadline-rules")}
    pack = source.load_pack(root / "data" / "pack")
    found = pack_lint.lint_pack(pack, acts, today=today, rules=rule_ids if rule_ids else None)
    bad = pack_lint.errors(found)
    if bad:
        raise BuildError("pack_lint не пропускает пакет:\n" + "\n".join(map(str, bad)))
    lists = source.load_lists(root)
    rows = {
        "documents": documents(root, pack, acts, today),
        "ladder": ladder(root, pack),
        "reply-types": reply_types(root, pack),
        "channels": channels(root, pack),
        "addressees-federal": _check(root, "addressees-federal", pack["addressees-federal"],
                                     "data/pack/addressees-federal.yaml"),
        "turning18": turning18(root, pack),
        "scenarios": scenarios(root, lists["scenarios"]),
        "entrypoints": _check(root, "entrypoints", lists["entrypoints"], "data/entrypoints.yaml"),
    }
    _cross_check(rows, pack)
    used_acts = {resolve.split_ref(r)[0] for d in rows["documents"] for b in d["blocks"] for r in b["norm_refs"]}
    used_acts |= {resolve.split_ref(r)[0] for t in rows["turning18"] for r in t["norm_refs"]}
    used_rules = {e["rule_id"] for e in rows["ladder"] if e["rule_id"]}
    used_rules |= {r for s in rows["scenarios"] for r in s["rule_ids"]}
    used_rules |= {t["rule_id"] for t in rows["turning18"] if t["rule_id"]}
    m = pack["meta"]
    pack_item = coerce({
        "id": m["id"], "version": m["version"], "status": m["status"], "tiers_enabled": m.get("tiers_enabled", []),
        "reviewers": m.get("reviewers", []), "reviewed_at": m.get("reviewed_at", ""),
        "released_at": m["released_at"], "expires_after_days": m["expires_after_days"],
        "first_public_at": m.get("first_public_at", ""), "notice": m["notice"],
        "documents": [d["id"] for d in rows["documents"]],
        "receipt": {"title": "Отметка о приёме",
                    "lines": ["Дата приёма", "Входящий номер", "Кто принял: должность, фамилия", "Подпись"]},
        "print_mark": "Черновик",
        "region_numbers": "all",
        "rule_notes": m.get("rule_notes") or [],
        "unverified": unverified(rows, v, used_acts, used_rules),
        "neighbors": neighbors(v),
        "verified": m.get("verified", "false"), "verified_at": m.get("verified_at", ""),
        "source_ref": m.get("source_ref", "ok-pack"),
    }, source.item_schema(root, "pack"))
    rows["pack"] = _check(root, "pack", [pack_item], "data/pack/pack.yaml")
    return {"rows": rows, "vendor": v, "lint": found, "acts": acts}


def _cross_check(rows: dict, pack: dict) -> None:
    docs = {d["id"] for d in rows["documents"]}
    conditions = {e["from_condition"] for e in rows["ladder"]}
    problems = []
    for s in rows["scenarios"]:
        for d in s["docs"]:
            if d not in docs:
                problems.append(f"data/scenarios.yaml, {s['id']}: документа {d} нет в пакете")
        if s["start_condition"] not in conditions:
            problems.append(f"data/scenarios.yaml, {s['id']}: для {s['start_condition']} нет шагов в graph.yaml")
    for t in rows["reply-types"]:
        if t["id"] != "resolved" and t["condition"] not in conditions:
            problems.append(f"reply-types.yaml, {t['id']}: для {t['condition']} нет шагов в graph.yaml")
        if t["parent"] and t["parent"] not in {x["id"] for x in rows["reply-types"]}:
            problems.append(f"reply-types.yaml, {t['id']}: нет родителя {t['parent']}")
    nodes = {n["id"] for n in pack["nodes"]}
    for d in rows["documents"]:
        for k in d["addressee_kinds"]:
            if k != "none" and k not in nodes:
                problems.append(f"{d['id']}: адресата {k} нет в graph.yaml")
    for a in rows["addressees-federal"]:
        if a["node"] not in nodes:
            problems.append(f"addressees-federal.yaml, {a['id']}: узла {a['node']} нет в graph.yaml")
    if problems:
        raise BuildError("\n".join(problems))


def datasets(root) -> list[dict]:
    root = Path(root)
    meta = source.load_meta(root)
    srcs = source.load_sources(root)
    res = build_all(root)
    rows, v = res["rows"], res["vendor"]
    norms_src = _neighbor_source(v, "pal-norms", "acts")
    extra = {
        "documents": norms_src,
        "ladder": _neighbor_source(v, "pal-norms", "deadline-rules"),
        "pack": norms_src + _neighbor_source(v, "pal-norms", "deadline-rules")
        + _neighbor_source(v, "pal-directory", "region-lines"),
        "turning18": _neighbor_source(v, "pal-norms", "deadline-rules"),
    }
    envs = []
    for name, items in rows.items():
        stale = 90 if name == "entrypoints" else STALE
        envs.append(make_envelope(dataset=name, repo=REPO, items=items, meta=meta, license=LICENSE,
                                  source=_sources(srcs, items, extra.get(name)) or
                                  [{"id": "ok-pack", "title": srcs["ok-pack"]["title"]}],
                                  stale_after_days=stale))
    return envs
