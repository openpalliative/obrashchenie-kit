import json
from pathlib import Path

from opsite.data import BuildError, coerce, read_yaml

DATASET_FILES = {
    "scenarios": ("scenarios.yaml", "scenarios"),
    "entrypoints": ("entrypoints.yaml", "entrypoints"),
}
PACK_FILES = {
    "ladder": ("graph.yaml", "edges"),
    "reply-types": ("reply-types.yaml", "types"),
    "channels": ("channels.yaml", "channels"),
    "addressees-federal": ("addressees-federal.yaml", "addressees"),
    "turning18": ("turning18.yaml", "items"),
}


def item_schema(root: Path, name: str) -> dict:
    path = root / "data" / "schema" / f"{name}.schema.json"
    return json.loads(path.read_text(encoding="utf-8"))["properties"]["items"]["items"]


def _need(obj, key: str, where: str):
    if not isinstance(obj, dict) or key not in obj:
        raise BuildError(f"{where}: нет ключа {key}")
    return obj[key]


def _rows(path: Path, key: str) -> list[dict]:
    data = read_yaml(path)
    rows = _need(data, key, path.name)
    if not isinstance(rows, list):
        raise BuildError(f"{path.name}: {key} должен быть списком")
    return rows


def expand_document(doc: dict, groups: dict, shared: dict, where: str) -> dict:
    fields = []
    for f in doc.get("fields", []):
        if "group" in f:
            g = groups.get(f["group"])
            if g is None:
                raise BuildError(f"{where}: нет группы полей {f['group']} в fields.yaml")
            hints = f.get("hints") or {}
            fields.extend({**x, "hint": hints[x["id"]]} if x["id"] in hints else dict(x) for x in g)
        else:
            fields.append(dict(f))
    blocks = []
    for b in doc.get("blocks", []):
        if "use" in b:
            g = shared.get(b["use"])
            if g is None:
                raise BuildError(f"{where}: нет общих блоков {b['use']} в fields.yaml")
            blocks.extend(dict(x) for x in g)
        else:
            blocks.append(dict(b))
    for b in blocks:
        b.setdefault("place", "body")
        b.setdefault("kind", "text")
        b.setdefault("norm_refs", [])
    out = dict(doc)
    out["fields"] = fields
    out["blocks"] = blocks
    out.setdefault("norm_refs", [])
    return out


def load_pack(pack_dir: Path) -> dict:
    meta = read_yaml(pack_dir / "pack.yaml")
    fdef = read_yaml(pack_dir / "fields.yaml") if (pack_dir / "fields.yaml").is_file() else {}
    groups = (fdef or {}).get("groups", {})
    shared = (fdef or {}).get("blocks", {})
    docs = []
    ddir = pack_dir / "documents"
    for p in sorted(ddir.glob("*.yaml")) if ddir.is_dir() else []:
        raw = read_yaml(p)
        if not isinstance(raw, dict) or "id" not in raw:
            raise BuildError(f"{p.name}: нет id документа")
        if raw["id"] != p.stem:
            raise BuildError(f"{p.name}: id {raw['id']} не совпадает с именем файла")
        d = expand_document(raw, groups, shared, f"documents/{p.name}")
        d["_file"] = f"documents/{p.name}"
        docs.append(d)
    graph = read_yaml(pack_dir / "graph.yaml")
    pack = {
        "meta": meta,
        "documents": docs,
        "nodes": _need(graph, "nodes", "graph.yaml"),
        "edges": _need(graph, "edges", "graph.yaml"),
    }
    for name, (fname, key) in PACK_FILES.items():
        if name == "ladder":
            continue
        path = pack_dir / fname
        pack[name] = _rows(path, key) if path.is_file() else []
    rt = read_yaml(pack_dir / "reply-types.yaml") if (pack_dir / "reply-types.yaml").is_file() else {}
    pack["reply_types_meta"] = {k: v for k, v in (rt or {}).items() if k != "types"}
    return pack


def coerce_rows(root: Path, name: str, rows: list[dict]) -> list[dict]:
    schema = item_schema(root, name)
    return [coerce(r, schema) for r in rows]


def load_sources(root: Path) -> dict:
    rows = _rows(root / "data" / "sources.yaml", "sources")
    return {r["id"]: r for r in rows}


def load_meta(root: Path) -> dict:
    meta = read_yaml(root / "data" / "meta.yaml")
    for key in ("data_date", "version"):
        _need(meta, key, "data/meta.yaml")
    return meta


def load_lists(root: Path) -> dict:
    out = {}
    for name, (fname, key) in DATASET_FILES.items():
        out[name] = _rows(root / "data" / fname, key)
    return out
