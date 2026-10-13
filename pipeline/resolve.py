import datetime as dt
import re

NORM_PH = re.compile(r"\{\{norm:([a-z0-9-]+)(?:#(p-[a-z0-9-]+))?\}\}")
PLACEHOLDER = re.compile(r"\{\{([^{}]*)\}\}")
KIND_GENITIVE = {
    "ministry_order": "приказа",
    "joint_order": "приказа",
    "government_decree": "постановления",
    "government_order": "распоряжения",
    "federal_law": "Федерального закона",
    "code": "",
}
AUTHORITY_GENITIVE = (("Министерство", "Министерства"), ("Правительство", "Правительства"), ("Президент", "Президента"),
                      ("Минздрав", "Минздрава"), ("Минтруд", "Минтруда"), ("Минфин", "Минфина"))
LAWS = {"federal_law", "code"}


def split_ref(ref: str) -> tuple[str, str]:
    act_id, _, anchor = ref.partition("#")
    return act_id, anchor


def point_text(kind: str, anchor: str) -> str | None:
    if not anchor:
        return ""
    m = re.fullmatch(r"p-(\d+)(?:-(\d+))?", anchor)
    if m and kind in LAWS:
        art, part = m.groups()
        return f"часть {part} статьи {art}" if part else f"статья {art}"
    if m and not m.group(2):
        return f"пункт {m.group(1)}"
    m = re.fullmatch(r"p-a(\d+)-(\d+)", anchor)
    if m:
        return f"пункт {m.group(2)} приложения {m.group(1)}"
    return None


def authority_genitive(text: str) -> str:
    parts = [p.strip() for p in re.split(r",| и ", text) if p.strip()]
    out = []
    for p in parts:
        for nom, gen in AUTHORITY_GENITIVE:
            if p.startswith(nom + " "):
                p = gen + p[len(nom):]
        out.append(p)
    return " и ".join(out)


def ru_date(iso: str) -> str:
    d = dt.date.fromisoformat(iso)
    return f"{d.day:02d}.{d.month:02d}.{d.year}"


def citation(act: dict, anchor: str) -> str | None:
    point = point_text(act.get("kind", ""), anchor)
    if point is None or not act.get("number") or not act.get("doc_date"):
        return None
    kind = act.get("kind", "")
    head = KIND_GENITIVE.get(kind, "")
    if kind in LAWS:
        base = f"{head} от {ru_date(act['doc_date'])} № {act['number']} «{act['title']}»".strip()
    else:
        auth = authority_genitive(act.get("authority", ""))
        base = f"{head} {auth} от {ru_date(act['doc_date'])} № {act['number']}".strip()
    return f"{point} {base}".strip() if point else base


def act_state(act: dict | None, today: dt.date) -> tuple[str, str | None]:
    if act is None:
        return "fallback", "unknown"
    status = act.get("status")
    if status == "repealed":
        return "fallback", "repealed"
    if status != "in_force":
        return "fallback", "not_in_force"
    until = act.get("valid_until")
    if until and dt.date.fromisoformat(until) < today:
        return "fallback", "not_in_force"
    if act.get("verified") is not True:
        return "fallback", "unverified"
    return "ok", None


def resolve_block(block: dict, acts: dict, today: dt.date) -> dict:
    out = dict(block)
    refs = list(block.get("norm_refs") or [])
    links = []
    state, reason = ("ok", None) if refs else ("none", None)
    text = block.get("text", "")
    for ref in refs:
        act_id, anchor = split_ref(ref)
        act = acts.get(act_id)
        s, r = act_state(act, today)
        cite = citation(act, anchor) if act and s == "ok" else None
        if s == "ok" and cite is None:
            s, r = "fallback", "unknown"
        links.append({
            "ref": ref, "act_id": act_id, "anchor": anchor,
            "point": point_text(act.get("kind", ""), anchor) or "" if act else "",
            "status": (act or {}).get("status", "unknown"),
            "verified": bool((act or {}).get("verified")),
            "citation": cite or "",
        })
        if s != "ok":
            state, reason = "fallback", reason or r
    if state == "ok":
        def sub(m):
            ref = m.group(1) + (f"#{m.group(2)}" if m.group(2) else "")
            return next(link["citation"] for link in links if link["ref"] == ref)
        text = NORM_PH.sub(sub, text)
    elif state == "fallback":
        text = block.get("fallback", "")
    out["text"] = text
    out["norm_state"] = state
    out["norm_reason"] = reason
    out["norm_links"] = links
    return out


def doc_norm_state(blocks: list[dict]) -> str:
    states = {b["norm_state"] for b in blocks}
    if "fallback" in states:
        return "fallback"
    return "ok" if "ok" in states else "none"
