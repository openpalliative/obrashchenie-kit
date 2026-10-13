import datetime as dt
import json
import os
import shutil
import sys
from pathlib import Path

from opsite.data import content_sha256

FORMAT = "openpalliative-dataset/1"
FIXED_AT = "2026-10-11T12:00:00Z"
DIRECTORY_REQUIRED = {
    "regions": ["id", "name", "verified", "verified_at"],
    "addressees": ["id", "region_id", "agency", "name", "line_ids", "verified", "verified_at"],
    "region-lines": ["id", "region_id", "agency", "tel", "number_display", "roles", "origin", "verified", "verified_at"],
    "federal-lines": ["id", "number", "tel", "label", "verified", "verified_at"],
}


def calendar_year(base: dict, year: int, transfers: list[dict]) -> tuple[list[str], list[str]]:
    hol = {dt.date(year, int(m[:2]), int(m[3:])) for m in base["holidays_mmdd"]}
    excl = {dt.date(year, int(m[:2]), int(m[3:])) for m in base["carry_exclude_mmdd"]}
    moved = {dt.date.fromisoformat(t["from"]) for t in transfers}
    off = set(hol) | {dt.date.fromisoformat(t["to"]) for t in transfers}
    work = {d for d in moved if d not in hol}
    if base.get("carry_over"):
        for h in sorted(hol):
            if h.weekday() >= 5 and h not in excl and h not in moved:
                d = h + dt.timedelta(days=1)
                while d.weekday() >= 5 or d in off:
                    d += dt.timedelta(days=1)
                off.add(d)
    return sorted(d.isoformat() for d in off), sorted(d.isoformat() for d in work)


def envelope(repo: str, name: str, items: list[dict], src: dict) -> dict:
    return {
        "format": FORMAT, "dataset": name, "repo": repo, "schema_version": "1.0.0", "version": "2026.10.11",
        "generated_at": FIXED_AT, "data_date": "2026-10-11", "stale_after_days": 90, "license": src["license"],
        "source": src["source"], "content_sha256": content_sha256(src["source"], items),
        "counts": {"items": len(items), "unverified": sum(1 for i in items if i.get("verified") is not True),
                   "excluded": 0},
        "items": items,
    }


def directory_schema(name: str) -> dict:
    return {"$schema": "https://json-schema.org/draft/2020-12/schema",
            "title": f"pal-directory {name}, минимальная схема тестового снимка",
            "type": "object",
            "properties": {"dataset": {"const": name},
                           "items": {"type": "array", "items": {"type": "object",
                                                                "required": DIRECTORY_REQUIRED[name]}}}}


def write_json(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


def build_vendor(root: Path, norms_schema_dir: Path | None) -> list[Path]:
    written = []
    src_dir = root / "tests" / "fixtures" / "vendor-src"
    for f in sorted(src_dir.glob("*.json")):
        src = json.loads(f.read_text(encoding="utf-8"))
        repo = src["repo"]
        out = root / "tests" / "fixtures" / "vendor" / repo / "v1"
        index = []
        for name, items in src["datasets"].items():
            if repo == "pal-norms" and name == "calendar":
                base = next(i for i in items if i["kind"] == "baseline")
                for it in items:
                    if it["kind"] == "year":
                        it["off"], it["work"] = calendar_year(base, it["year"], it["transfers"])
            env = envelope(repo, name, items, src)
            write_json(out / f"{name}.json", env)
            schema_path = out / f"{name}.schema.json"
            if repo == "pal-norms":
                if norms_schema_dir and (norms_schema_dir / f"{name}.schema.json").is_file():
                    shutil.copyfile(norms_schema_dir / f"{name}.schema.json", schema_path)
            else:
                write_json(schema_path, directory_schema(name))
            raw = (out / f"{name}.json").read_bytes()
            index.append({"name": name, "path": f"{name}.json", "schema": f"{name}.schema.json",
                          "schema_version": "1.0.0", "version": env["version"], "data_date": env["data_date"],
                          "content_sha256": env["content_sha256"], "bytes": len(raw), "items": len(items)})
            written.append(out / f"{name}.json")
        write_json(out / "index.json", {"repo": repo, "generated_at": FIXED_AT, "opsite_version": "0.1.0",
                                        "datasets": index})
    lib_src = root / "tests" / "fixtures" / "vendor-src" / "deadlines.js"
    if lib_src.is_file():
        dest = root / "tests" / "fixtures" / "vendor" / "pal-norms" / "lib" / "deadlines.js"
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(lib_src, dest)
    return written


def build_own(root: Path) -> list[Path]:
    from . import export
    os.environ["OK_VENDOR"] = "fixtures"
    written = []
    for env in export.datasets(root):
        env = dict(env, generated_at=FIXED_AT)
        p = root / "tests" / "fixtures" / f"{env['dataset']}.json"
        write_json(p, env)
        written.append(p)
    return written


def build_golden(root: Path) -> list[Path]:
    import yaml
    written = []
    for p in sorted((root / "tests" / "golden").glob("*.yaml")):
        data = yaml.safe_load(p.read_text(encoding="utf-8"))
        out = p.with_suffix(".json")
        write_json(out, data)
        written.append(out)
    return written


def main(argv=None) -> int:
    root = Path.cwd()
    norms = root.parent / "pal-norms" / "data" / "schema"
    files = build_vendor(root, norms if norms.is_dir() else None)
    files += build_own(root)
    files += build_golden(root)
    for p in files:
        print(p.relative_to(root))
    return 0


if __name__ == "__main__":
    sys.exit(main())
