import json
import re
import shutil
from pathlib import Path

import yaml

from opsite.data import BuildError
from opsite.render import md

KIT = ["scenarios", "documents", "ladder", "reply-types", "channels", "addressees-federal", "turning18", "pack",
       "entrypoints"]
VENDOR = {
    "pal-norms": ["acts", "deadline-rules", "calendar", "escalation"],
    "pal-directory": ["regions", "addressees", "region-lines", "federal-lines"],
}
RUNTIME = {"pal-norms": ["deadline-rules", "calendar", "acts"],
           "pal-directory": ["regions", "addressees", "region-lines", "federal-lines"]}
ROLE_LABELS = {"self": "Я сам пациент", "proxy": "По доверенности", "guardian": "Опекун", "parent": "Родитель ребёнка"}
KIND_LABELS = {
    "mo_head": "Главному врачу больницы или поликлиники",
    "mo_vk": "Врачебной комиссии больницы или поликлиники",
    "rzn_to": "Росздравнадзор в вашем регионе",
    "minzdrav_region": "Минздрав вашего региона",
    "rzn_central": "Росздравнадзор, центральный аппарат",
    "minzdrav_rf": "Минздрав России",
    "prosecutor": "Прокуратура",
    "none": "Вкладывается к документу",
}


def _read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8")) if path.is_file() else None


def _kit(ctx, name: str) -> dict:
    env = ctx.data.get(name) or _read_json(ctx.root / "tests" / "fixtures" / f"{name}.json")
    if env is None:
        raise BuildError(f"Нет датасета {name}: ни в data/, ни в tests/fixtures/")
    return env


def _vendor(ctx, repo: str, name: str) -> tuple[dict | None, str]:
    env = ctx.vendor.get(repo, {}).get(name)
    if env is not None:
        test_snapshot = any(re.match(r"(fixture|synthetic|demo)", src.get("id", "")) for src in env.get("source", []))
        return env, "fixtures" if test_snapshot else "vendor"
    env = _read_json(ctx.root / "tests" / "fixtures" / "vendor" / repo / "v1" / f"{name}.json")
    return env, "fixtures" if env is not None else "none"


def _front(path: Path) -> tuple[dict, str]:
    text = path.read_text(encoding="utf-8")
    if text.startswith("---\n") and "\n---\n" in text[4:]:
        head, body = text[4:].split("\n---\n", 1)
        return yaml.load(head, Loader=yaml.BaseLoader) or {}, body
    return {}, text


def _sections(body: str) -> dict:
    out, key, buf = {}, "intro", []
    for line in body.splitlines():
        m = re.match(r"^## \{#([a-z-]+)\}\s*$", line)
        if m:
            out[key] = md("\n".join(buf))
            key, buf = m.group(1), []
        else:
            buf.append(line)
    out[key] = md("\n".join(buf))
    return out


def _scenario_texts(root: Path) -> dict:
    out = {}
    for f in sorted((root / "content" / "scenarios").glob("*.md")):
        fm, body = _front(f)
        out[f.stem] = {"meta": fm, "parts": _sections(body)}
    return out


PH = re.compile(r"\{\{\s*([a-z_]+)(?::([A-Za-z0-9_#-]+))?\s*\}\}")


def blank(text: str, d: dict) -> str:
    def sub(m):
        if m.group(1) == "date":
            return "«___» ____________ 20___ г."
        return "______________________"
    return PH.sub(sub, str(text))


GROUPS = [
    ("addressee", "Куда подаёте", ("addressee_",)),
    ("applicant", "О вас", ("applicant_",)),
    ("person", "О человеке, за которого вы обращаетесь", ("patient_", "proxy_", "guardian_", "child_")),
    ("records_owner", "Чьи документы нужны", ("patient_id_doc", "patient_residence")),
    ("sign", "Ответ и подпись", ("answer_way", "attachments", "signed_at")),
]


def field_groups(fields: list) -> list:
    out = []
    for f in fields:
        key, title = "body", "Суть обращения"
        for gid, gtitle, prefixes in GROUPS:
            if f["id"].startswith(prefixes):
                key, title = gid, gtitle
        if not out or out[-1]["id"] != key:
            out.append({"id": key, "title": title, "fields": [],
                        "roles": "proxy guardian parent" if key == "person" else ""})
        out[-1]["fields"].append(f)
    return out


def plus_days(iso: str, n: int) -> str:
    import datetime as dt
    return (dt.date.fromisoformat(str(iso)[:10]) + dt.timedelta(days=int(n))).isoformat()


def context(ctx) -> dict:
    kit = {name: _kit(ctx, name) for name in KIT}
    vend, origin = {}, {}
    for repo, names in VENDOR.items():
        for name in names:
            env, where = _vendor(ctx, repo, name)
            if env is None:
                continue
            vend.setdefault(repo, {})[name] = env
            origin[f"{repo}/{name}"] = where
            if where == "fixtures" and name not in ctx.vendor.get(repo, {}):
                ctx.vendor.setdefault(repo, {})[name] = env
    docs = {d["id"]: d for d in kit["documents"]["items"]}
    rules = {r["id"]: r for r in vend.get("pal-norms", {}).get("deadline-rules", {"items": []})["items"]}
    acts = {a["id"]: a for a in vend.get("pal-norms", {}).get("acts", {"items": []})["items"]}
    safe = {k: a.get("status") == "in_force" and a.get("verified") is True for k, a in acts.items()}
    rule_norms_ok = {k: all(safe.get(n, False) for n in r.get("norm_ids", [])) for k, r in rules.items()}
    regions = [r for r in vend.get("pal-directory", {}).get("regions", {"items": []})["items"] if not r.get("excluded")]
    by_cond: dict = {}
    for e in kit["ladder"]["items"]:
        if e.get("from_condition"):
            labels = by_cond.setdefault(e["from_condition"], [])
            if e["label"] not in labels:
                labels.append(e["label"])
    return {
        "kit": kit, "options_by_condition": by_cond, "rule_norms_ok": rule_norms_ok, "vend": vend, "vendor_origin": origin, "docs": docs, "rules": rules,
        "regions": sorted(regions, key=lambda r: r.get("name", r["id"])),
        "scenario_texts": _scenario_texts(ctx.root),
        "role_labels": ROLE_LABELS, "blank": blank, "plus_days": plus_days, "field_groups": field_groups, "kind_labels": KIND_LABELS,
        "pack": kit["pack"]["items"][0] if kit["pack"]["items"] else {},
    }


def _copy_runtime(ctx) -> None:
    for repo, names in RUNTIME.items():
        for name in names:
            env = ctx.site["vend"].get(repo, {}).get(name)
            if env is None:
                continue
            dest = ctx.out / "vendor" / repo / "v1" / f"{name}.json"
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_text(json.dumps(env, ensure_ascii=False), encoding="utf-8")
    lib = ctx.root / "vendor" / "pal-norms" / "lib" / "deadlines.js"
    if not lib.is_file():
        lib = ctx.root / "tests" / "fixtures" / "vendor" / "pal-norms" / "lib" / "deadlines.js"
    if not lib.is_file():
        raise BuildError("Нет deadlines.js: ни в vendor/pal-norms/lib/, ни в tests/fixtures/vendor/")
    dest = ctx.out / "vendor" / "pal-norms" / "lib" / "deadlines.js"
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(lib, dest)
    sit = [{"id": x["id"], "title": x["title"]} for x in ctx.situations]
    (ctx.out / "assets").mkdir(exist_ok=True)
    (ctx.out / "assets" / "situations.json").write_text(json.dumps(sit, ensure_ascii=False), encoding="utf-8")
    schema = ctx.root / "data" / "schema" / "case-backup.schema.json"
    if schema.is_file():
        (ctx.out / "schema").mkdir(exist_ok=True)
        shutil.copyfile(schema, ctx.out / "schema" / "case-backup.schema.json")


def pages(ctx):
    _copy_runtime(ctx)
    site = ctx.site
    docs = site["docs"]
    for s in site["kit"]["scenarios"]["items"]:
        yield f"scenarios/{s['id']}/", "scenario.html.j2", {
            "scenario": s, "text": site["scenario_texts"].get(s["id"], {"meta": {}, "parts": {}}),
            "nav_current": "",
        }
    channels = {c["id"]: c for c in site["kit"]["channels"]["items"]}
    for d in docs.values():
        yield f"docs/{d['id']}/", "doc.html.j2", {
            "d": d, "doc_channels": [channels[c] for c in d.get("channels", []) if c in channels],
            "nav_current": "", "noindex": True,
        }
