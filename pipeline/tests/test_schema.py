import json

import jsonschema
import pytest

from opsite.build import check_envelope
from pipeline import export

from .conftest import ROOT

OWN = ["documents", "ladder", "reply-types", "channels", "addressees-federal", "turning18", "pack", "scenarios",
       "entrypoints"]


def test_data_passes_schemas():
    envs = {e["dataset"]: e for e in export.datasets(ROOT)}
    assert sorted(envs) == sorted(OWN)
    for name, env in envs.items():
        check_envelope(env, ROOT / "data" / "schema" / f"{name}.schema.json", name)


@pytest.mark.parametrize("name", OWN)
def test_own_fixtures_pass_schemas(name):
    env = json.loads((ROOT / "tests" / "fixtures" / f"{name}.json").read_text(encoding="utf-8"))
    check_envelope(env, ROOT / "data" / "schema" / f"{name}.schema.json", name)


def test_vendor_fixtures_pass_their_schemas():
    files = [p for p in (ROOT / "tests" / "fixtures" / "vendor").rglob("v1/*.json")
             if not p.name.endswith(".schema.json") and p.name != "index.json"]
    assert len(files) == 8
    for p in files:
        env = json.loads(p.read_text(encoding="utf-8"))
        check_envelope(env, p.with_name(p.stem + ".schema.json"), str(p))


def test_entrypoints_match_ux_map():
    env = next(e for e in export.datasets(ROOT) if e["dataset"] == "entrypoints")
    ids = [i["id"] for i in env["items"]]
    assert ids == ["oral-refusal", "vk-refused", "discharge", "forwarded", "no-answer", "case", "answer", "call",
                   "turning-18"]
    hub = json.loads((ROOT / "opsite" / "schema" / "entrypoints.schema.json").read_text(encoding="utf-8"))
    jsonschema.Draft202012Validator(hub).validate(env)


@pytest.mark.parametrize("name,ok", [("good", True), ("html-note", True), ("wrong-repo", False),
                                     ("bad-schema", False), ("too-big", False)])
def test_backup_files(name, ok):
    schema = json.loads((ROOT / "data" / "schema" / "case-backup.schema.json").read_text(encoding="utf-8"))
    raw = (ROOT / "tests" / "fixtures" / "backups" / f"{name}.json").read_bytes()
    valid = len(raw) <= 1024 * 1024 and not list(
        jsonschema.Draft202012Validator(schema).iter_errors(json.loads(raw)))
    assert valid is ok
