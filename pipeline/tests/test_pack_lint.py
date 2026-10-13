import datetime as dt

import pytest

from pipeline import pack_lint, source, vendor

from .conftest import FIX, ROOT

ACTS = pack_lint.acts_from_file(FIX / "acts.json")
TODAY = dt.date(2026, 10, 11)
BAD = {
    "bad-345n": "norm_repealed",
    "bad-literal": "literal_act",
    "bad-edge": "edge_to_respondent",
    "bad-fallback": "no_fallback",
    "bad-placeholder": "unknown_placeholder",
    "bad-territory": "excluded_territory",
    "bad-brand": "doc_brand",
    "bad-drugs": "stoplist",
    "bad-expired-act": "no_fallback",
    "bad-private-note": "no_private_note",
}


def codes(found, level="error"):
    return {f.code for f in found if f.level == level}


def test_good_pack_passes():
    found = pack_lint.lint_dir(FIX / "packs" / "good", ACTS, today=TODAY)
    assert codes(found) == set()
    assert codes(found, "warning") == {"norm_unverified"}


@pytest.mark.parametrize("name,code", sorted(BAD.items()))
def test_bad_pack_fails_with_its_code(name, code):
    found = pack_lint.lint_dir(FIX / "packs" / name, ACTS, today=TODAY)
    assert codes(found) == {code}


def test_345n_must_fail_even_with_fallback():
    pack = source.load_pack(FIX / "packs" / "bad-345n")
    block = next(b for d in pack["documents"] for b in d["blocks"] if b["id"] == "term")
    assert block.get("fallback")
    found = pack_lint.lint_pack(pack, ACTS, today=TODAY)
    assert "norm_repealed" in codes(found)


def test_t1_rules():
    found = pack_lint.lint_dir(FIX / "packs" / "bad-t1-expired", ACTS, today=TODAY)
    assert codes(found) == {"t1_expired", "t1_reviewers"}


def test_cli_exit_codes(capsys):
    assert pack_lint.main([str(FIX / "packs" / "good"), "--acts", str(FIX / "acts.json")]) == 0
    assert pack_lint.main([str(FIX / "packs" / "bad-345n"), "--acts", str(FIX / "acts.json")]) == 1
    assert "norm_repealed" in capsys.readouterr().out


def test_real_pack_passes_with_fixture_snapshot():
    v = vendor.load(ROOT, "fixtures")
    acts = {a["id"]: a for a in vendor.items(v, "pal-norms", "acts")}
    rules = {r["id"] for r in vendor.items(v, "pal-norms", "deadline-rules")}
    found = pack_lint.lint_dir(ROOT / "data" / "pack", acts, today=TODAY, rules=rules)
    assert codes(found) == set()
    assert codes(found, "warning") == {"norm_unverified"}


def test_real_pack_fails_closed_if_norm_repealed():
    v = vendor.load(ROOT, "fixtures")
    acts = {a["id"]: dict(a) for a in vendor.items(v, "pal-norms", "acts")}
    acts["180n"]["status"] = "repealed"
    found = pack_lint.lint_dir(ROOT / "data" / "pack", acts, today=TODAY)
    assert "norm_repealed" in codes(found)


def test_private_note_covers_every_mo_answer_edge():
    pack = source.load_pack(ROOT / "data" / "pack")
    notes = {(n["rule_id"], to) for n in pack["meta"]["rule_notes"] for to in n["to"]}
    edges = [e for e in pack["edges"] if e.get("rule_id") == "59fz-answer" and e["to"] in pack_lint.MO_NODES]
    assert edges
    assert all((e["rule_id"], e["to"]) in notes for e in edges)
    text = pack["meta"]["rule_notes"][0]["text"]
    assert "частная" in text and "государственных и муниципальных" in text
