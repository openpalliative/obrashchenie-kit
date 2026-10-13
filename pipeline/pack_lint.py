import argparse
import datetime as dt
import json
import re
import sys
from dataclasses import asdict, dataclass
from pathlib import Path

import yaml

from opsite.data import OPSITE, BuildError

from . import resolve, source, vendor

LITERAL_ACT = [re.compile(p) for p in (r"№\s?\d+", r"\b\d+\s?н\b", r"\b\d+-ФЗ\b", r"\b\d+-р\b", r"\bПП\s?№")]
LATIN = re.compile(r"[A-Za-z]")
DOSE = re.compile(r"\d+(?:[.,]\d+)?\s?(?:мг|мкг|мл|ЕД|таб\.)(?![А-Яа-яЁё])")
FIELD_ID = re.compile(r"^[a-z][a-z0-9_]*$")
T1_MAX_DAYS = 365
LOWER_KINDS = {"request", "wait", "info"}
PUBLIC_ONLY_RULES = {"59fz-answer"}
MO_NODES = {"mo_head", "mo_vk"}


@dataclass
class Finding:
    code: str
    level: str
    file: str
    where: str
    message: str

    def __str__(self) -> str:
        kind = "Ошибка" if self.level == "error" else "Предупреждение"
        return f"{kind} [{self.code}] {self.file} {self.where}: {self.message}"


def _dictionaries() -> tuple[re.Pattern, re.Pattern]:
    lint_dir = OPSITE / "lint"
    terr = yaml.load((lint_dir / "territories.yaml").read_text(encoding="utf-8"), Loader=yaml.BaseLoader)
    drugs = [ln.strip() for ln in (lint_dir / "drugs.txt").read_text(encoding="utf-8").splitlines()
             if ln.strip() and not ln.startswith("#")]
    return (re.compile("|".join(terr["patterns"])),
            re.compile(r"(?<![А-Яа-яЁё])(" + "|".join(map(re.escape, drugs)) + ")", re.IGNORECASE))


def _strings(obj, path=""):
    if isinstance(obj, str):
        yield path, obj
    elif isinstance(obj, dict):
        for k, v in obj.items():
            if not str(k).startswith("_"):
                yield from _strings(v, f"{path}.{k}" if path else str(k))
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            yield from _strings(v, f"{path}[{i}]")


def _date(value) -> dt.date | None:
    try:
        return dt.date.fromisoformat(value) if value else None
    except ValueError:
        return None


def lint_pack(pack: dict, acts: dict, *, today: dt.date | None = None, rules: set | None = None) -> list[Finding]:
    today = today or dt.date.today()
    terr, drugs = _dictionaries()
    out: list[Finding] = []

    def add(code, level, file, where, message):
        out.append(Finding(code, level, file, where, message))

    meta = pack["meta"]
    tiers = set(meta.get("tiers_enabled") or [])
    reviewers = meta.get("reviewers") or []
    doc_ids = {d["id"] for d in pack["documents"]}
    channel_ids = {c["id"] for c in pack.get("channels", [])}
    nodes = {n["id"]: n for n in pack["nodes"]}

    for d in pack["documents"]:
        f = d.get("_file", d["id"])
        fields = {x["id"]: x for x in d["fields"]}
        for fid in fields:
            if not FIELD_ID.match(fid):
                add("bad_field", "error", f, f"поле {fid}", "id поля латиницей через подчёркивание")
        for ch in d.get("channels", []):
            if ch not in channel_ids:
                add("unknown_ref", "error", f, "channels", f"канала {ch} нет в channels.yaml")
        texts = [("esia_summary", d.get("esia_summary", ""), [])]
        for b in d["blocks"]:
            refs = b.get("norm_refs") or []
            texts.append((f"блок {b['id']}", b.get("text", ""), refs))
            if b.get("fallback"):
                texts.append((f"блок {b['id']} fallback", b["fallback"], []))
            for ref in refs:
                act_id, anchor = resolve.split_ref(ref)
                act = acts.get(act_id)
                if act is None:
                    add("norm_unknown", "error", f, f"блок {b['id']}", f"нормы {act_id} нет в снимке pal-norms")
                    continue
                state, reason = resolve.act_state(act, today)
                if reason == "repealed":
                    add("norm_repealed", "error", f, f"блок {b['id']}",
                        f"норма {act_id} утратила силу, ссылаться на неё нельзя")
                elif state != "ok" and not b.get("fallback"):
                    add("no_fallback", "error", f, f"блок {b['id']}",
                        f"норма {act_id} не проверена или не действует, а запасной формулировки нет")
                elif reason == "unverified":
                    add("norm_unverified", "warning", f, f"блок {b['id']}",
                        f"норма {act_id} не проверена, в документ пойдёт запасная формулировка")
                elif state == "ok" and resolve.citation(act, anchor) is None:
                    add("no_fallback" if not b.get("fallback") else "norm_unverified",
                        "error" if not b.get("fallback") else "warning", f, f"блок {b['id']}",
                        f"не удаётся собрать ссылку {ref}")
            if b.get("list_field") and b["list_field"] not in fields:
                add("unknown_placeholder", "error", f, f"блок {b['id']}", f"поля {b['list_field']} нет в документе")
            if b.get("when"):
                wf = b["when"].split("=")[0]
                if wf not in fields:
                    add("unknown_placeholder", "error", f, f"блок {b['id']}", f"условие на поле {wf}, его нет")
        for where, text, refs in texts:
            for m in resolve.PLACEHOLDER.finditer(text):
                ph = m.group(1)
                if ph.startswith("norm:"):
                    ref = ph[5:]
                    if ref not in refs:
                        add("unknown_placeholder", "error", f, where, f"{{{{{ph}}}}} нет в norm_refs блока")
                elif ph.startswith("date:"):
                    fid = ph[5:]
                    if fields.get(fid, {}).get("type") != "date":
                        add("unknown_placeholder", "error", f, where, f"{{{{{ph}}}}}: нет поля-даты {fid}")
                elif ph not in fields:
                    add("unknown_placeholder", "error", f, where, f"{{{{{ph}}}}}: нет такого поля")
            plain = resolve.PLACEHOLDER.sub(" ", text)
            for rx in LITERAL_ACT:
                m = rx.search(plain)
                if m:
                    add("literal_act", "error", f, where,
                        f"номер акта «{m.group(0)}» литералом, ссылайтесь через {{{{norm:id}}}}")
                    break
            if LATIN.search(plain) or "openpalliative" in plain.lower():
                add("doc_brand", "error", f, where, "латиница или название проекта в тексте документа")
            m = drugs.search(plain) or DOSE.search(plain)
            if m:
                add("stoplist", "error", f, where, f"название препарата или доза «{m.group(0)}»")
        if d.get("tier") == "T1" and "T1" in tiers:
            reviewed = _date(d.get("reviewed_at"))
            if reviewed is None or (today - reviewed).days > T1_MAX_DAYS:
                add("t1_expired", "error", f, "reviewed_at",
                    "документ T1 без ревью юриста больше 12 месяцев, по правилу «мёртвой руки» он скрывается")
            if len(reviewers) < 2:
                add("t1_reviewers", "error", f, "reviewers", "для T1 нужны два ревьюера")

    for e in pack["edges"]:
        where = f"ребро {e['id']}"
        to = e.get("to")
        if to != "none" and to not in nodes:
            add("unknown_ref", "error", "graph.yaml", where, f"узла {to} нет")
            continue
        if e.get("doc") and e["doc"] not in doc_ids:
            add("unknown_ref", "error", "graph.yaml", where, f"документа {e['doc']} нет в пакете")
        if e.get("kind") == "complaint":
            if to == "none":
                add("edge_to_respondent", "error", "graph.yaml", where, "жалоба без адресата")
                continue
            node = nodes[to]
            if node.get("branch") != "prosecutor" and int(node["level"]) <= int(e["respondent_level"]):
                add("edge_to_respondent", "error", "graph.yaml", where,
                    f"жалоба ведёт в уровень {node['level']}, а обжалуется уровень {e['respondent_level']}")
        elif e.get("kind") not in LOWER_KINDS:
            add("unknown_ref", "error", "graph.yaml", where, f"неизвестный вид шага {e.get('kind')}")
        if rules is not None and e.get("rule_id") and e["rule_id"] not in rules:
            add("unknown_rule", "warning", "graph.yaml", where, f"правила {e['rule_id']} нет в снимке pal-norms")

    notes = {(n.get("rule_id"), to) for n in meta.get("rule_notes") or [] if n.get("text") for to in n.get("to") or []}
    for e in pack["edges"]:
        if e.get("rule_id") in PUBLIC_ONLY_RULES and e.get("to") in MO_NODES and (e["rule_id"], e["to"]) not in notes:
            add("no_private_note", "error", "pack.yaml", f"ребро {e['id']}",
                f"срок {e['rule_id']} к медицинской организации без оговорки про частные клиники в rule_notes")

    for name in ("channels", "addressees-federal", "turning18", "reply-types"):
        for row in pack.get(name, []):
            for path, text in _strings(row):
                if terr.search(text):
                    add("excluded_territory", "error", f"{name}.yaml", f"{row.get('id')} {path}",
                        "строка про исключённую территорию, решение за мейнтейнером в РФ")
    for d in pack["documents"]:
        for path, text in _strings(d):
            if terr.search(text):
                add("excluded_territory", "error", d.get("_file", d["id"]), path,
                    "строка про исключённую территорию, решение за мейнтейнером в РФ")
    for e in pack["edges"]:
        for path, text in _strings(e):
            if terr.search(text):
                add("excluded_territory", "error", "graph.yaml", f"{e['id']} {path}",
                    "строка про исключённую территорию, решение за мейнтейнером в РФ")
    return out


def lint_dir(pack_dir: Path, acts: dict, today: dt.date | None = None, rules: set | None = None) -> list[Finding]:
    return lint_pack(source.load_pack(pack_dir), acts, today=today, rules=rules)


def acts_from_file(path: Path) -> dict:
    env = json.loads(path.read_text(encoding="utf-8"))
    return {a["id"]: a for a in env["items"]}


def errors(findings: list[Finding]) -> list[Finding]:
    return [f for f in findings if f.level == "error"]


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="pack_lint", description="Проверка пакета шаблонов obrashchenie-kit")
    ap.add_argument("pack", nargs="?", default="data/pack")
    ap.add_argument("--acts", help="acts.json, по умолчанию снимок pal-norms из vendor/")
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args(argv)
    root = Path.cwd()
    try:
        if a.acts:
            acts = acts_from_file(Path(a.acts))
            rules = None
        else:
            v = vendor.load(root)
            acts = {x["id"]: x for x in vendor.items(v, "pal-norms", "acts")}
            rules = {x["id"] for x in vendor.items(v, "pal-norms", "deadline-rules")}
        found = lint_dir(Path(a.pack), acts, rules=rules)
    except BuildError as e:
        print(e, file=sys.stderr)
        return 1
    if a.json:
        print(json.dumps([asdict(f) for f in found], ensure_ascii=False, indent=1))
    else:
        for f in found:
            print(f)
        bad = errors(found)
        print(f"pack_lint: ошибок {len(bad)}, предупреждений {len(found) - len(bad)}")
    return 1 if errors(found) else 0


if __name__ == "__main__":
    sys.exit(main())
