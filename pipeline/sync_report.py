import argparse
import datetime as dt
import hashlib
import json
import subprocess
import sys
from pathlib import Path

from opsite.data import BuildError

from . import pack_lint, source, vendor

BLOCKING = {"norm_repealed", "norm_unknown", "no_fallback"}
FACT_DATASETS = {"calendar", "region-lines"}


def changed_datasets(root: Path) -> set[tuple[str, str]]:
    try:
        out = subprocess.run(["git", "status", "--porcelain", "--", "vendor", "deps.yaml"], cwd=root,
                             capture_output=True, text=True, check=True).stdout
    except (OSError, subprocess.CalledProcessError):
        return set()
    found = set()
    for line in out.splitlines():
        path = line[3:].strip()
        parts = Path(path).parts
        if len(parts) >= 4 and parts[0] == "vendor" and parts[2] == "v1" and parts[3].endswith(".json"):
            name = parts[3][:-5]
            if not name.endswith(".schema") and name != "index":
                found.add((parts[1], name))
        elif path == "deps.yaml":
            found.add(("deps", "deps"))
    return found


def blocked(root: Path, today: dt.date) -> list[dict]:
    v = vendor.load(root)
    acts = {a["id"]: a for a in vendor.items(v, "pal-norms", "acts")}
    pack = source.load_pack(root / "data" / "pack")
    found = [f for f in pack_lint.lint_pack(pack, acts, today=today) if f.code in BLOCKING]
    by_norm: dict = {}
    for f in found:
        norm = f.message.split()[1] if f.message.startswith("норм") else f.where
        by_norm.setdefault((f.code, norm), set()).add(f.file)
    items = []
    for (code, norm), files in sorted(by_norm.items()):
        status = (acts.get(norm) or {}).get("status", "нет в снимке")
        key = hashlib.sha256(f"{code}:{norm}:{status}".encode()).hexdigest()[:12]
        docs = ", ".join(sorted(Path(x).stem for x in files))
        items.append({"kind": "pack_blocked", "key": key,
                      "title": f"Пакет заблокирован: норма {norm} сменила статус [ok-review:{key}]",
                      "body": f"pack_lint: {code}. Статус нормы в снимке pal-norms: {status}. Затронуты документы: "
                              f"{docs}. Документы не соберутся, пока юрист в РФ не поправит пакет.",
                      "labels": ["review:legal"]})
    return items


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="sync_report", description="Итог синхронизации снимков для sync-data.yml")
    ap.add_argument("--out", default="_reports/sync.json")
    ap.add_argument("--build-ok", choices=["true", "false"], default="true")
    a = ap.parse_args(argv)
    root = Path.cwd()
    try:
        items = blocked(root, dt.date.today())
    except BuildError as e:
        items = [{"kind": "sync_error", "key": hashlib.sha256(str(e).encode()).hexdigest()[:12],
                  "title": "Снимки соседей не читаются", "body": str(e), "labels": ["facts"]}]
    changed = changed_datasets(root)
    only_facts = bool(changed) and all(name in FACT_DATASETS for _, name in changed)
    labels = ["facts"] if only_facts and a.build_ok == "true" and not items else ["review:legal"]
    report = {"changed": sorted(f"{r}/{n}" for r, n in changed), "labels": labels, "items": items}
    out = Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"изменилось: {', '.join(report['changed']) or 'ничего'}; метки PR: {', '.join(labels)}; "
          f"блокировок: {len(items)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
