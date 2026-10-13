import json
import re

from opsite.data import BuildError
from pipeline import export, vendor

from .conftest import ROOT, TODAY

LITERAL = re.compile(r"№\s?\d+|\b\d+\s?н\b|\b\d+-ФЗ\b")


def docs(built):
    return {d["id"]: d for d in built["rows"]["documents"]}


def block(doc, bid):
    return next(b for b in doc["blocks"] if b["id"] == bid)


def test_unverified_59fz_goes_to_fallback(built):
    b = block(docs(built)["deadline-complaint"], "no-answer")
    assert b["norm_state"] == "fallback"
    assert b["norm_reason"] == "unverified"
    assert b["text"] == "Ответ на моё обращение в установленный срок не получен."
    assert "статьи" not in b["text"]
    b = block(docs(built)["repeat-complaint"], "do-not-forward")
    assert b["norm_state"] == "fallback"
    assert not LITERAL.search(b["text"])


def test_verified_180n_gets_citation_from_snapshot(built):
    b = block(docs(built)["vk-extract"], "term")
    assert b["norm_state"] == "ok"
    assert "пункт 16 приказа Министерства здравоохранения Российской Федерации от 10.04.2025 № 180н" in b["text"]
    assert b["norm_links"][0]["act_id"] == "180n"


def test_no_literals_in_source_fields(built):
    for d in built["rows"]["documents"]:
        assert not LITERAL.search(d["esia_summary"])
        for b in d["blocks"]:
            if b["norm_state"] != "ok":
                assert not LITERAL.search(b["text"]), (d["id"], b["id"])
            assert not LITERAL.search(b.get("fallback", "")), (d["id"], b["id"])


def test_no_deadlines_in_document_texts(built):
    for d in built["rows"]["documents"]:
        for b in d["blocks"]:
            assert not re.search(r"\b\d+\s+(дн|рабоч|календар)", b["text"]), (d["id"], b["id"])


def test_six_t0_documents_and_counts(built):
    rows = built["rows"]
    assert [d["id"] for d in rows["documents"]] == ["written-answer", "vk-extract", "med-records",
                                                    "deadline-complaint", "repeat-complaint", "filing-sheet"]
    assert all(d["copies"] == 2 and d["receipt_block"] for d in rows["documents"])
    assert len(rows["reply-types"]) == 13
    assert len(rows["channels"]) == 5
    assert len(rows["addressees-federal"]) == 3
    assert len(rows["turning18"]) == 4
    assert len(rows["scenarios"]) == 5


def test_every_reply_type_has_options(built):
    conds = {e["from_condition"] for e in built["rows"]["ladder"]}
    for t in built["rows"]["reply-types"]:
        if t["id"] != "resolved":
            assert t["condition"] in conds, t["id"]


def test_complaints_never_go_to_respondent_level(built):
    for e in built["rows"]["ladder"]:
        if e["kind"] == "complaint" and e["to_branch"] != "prosecutor":
            assert e["to_level"] > e["respondent_level"], e["id"]


def test_pack_lists_unverified(built):
    pack = built["rows"]["pack"][0]
    ids = {(u["dataset"], u["id"]) for u in pack["unverified"]}
    assert ("acts", "59-fz") in ids
    assert ("deadline-rules", "59fz-answer") in ids
    assert ("turning18", "mse-orientir") in ids
    assert ("region-lines", "region-lines") in ids
    assert {c["id"] for c in built["rows"]["channels"]} <= {i for d, i in ids if d == "channels"}
    assert pack["status"] == "demo"
    assert all(n["fixture"] for n in pack["neighbors"])


def test_no_territories_in_output():
    pat = re.compile(r"[Дд]онецк|[Лл]уганск|[Зз]апорожск|[Хх]ерсонск|[Кк]рым(?!ск|ов)|[Сс]евастопол|ДНР|ЛНР")
    for env in export.datasets(ROOT):
        assert not pat.search(json.dumps(env, ensure_ascii=False)), env["dataset"]


def test_repealed_norm_blocks_build(monkeypatch):
    v = vendor.load(ROOT, "fixtures")
    v = json.loads(json.dumps(v))
    for a in v["pal-norms"]["acts"]["items"]:
        if a["id"] == "789n":
            a["status"] = "repealed"
    try:
        export.build_all(ROOT, today=TODAY, v=v)
    except BuildError as e:
        assert "norm_repealed" in str(e)
    else:
        raise AssertionError("сборка должна упасть на отменённой норме")


def test_unknown_rule_is_listed_not_fatal():
    v = vendor.load(ROOT, "fixtures")
    v = json.loads(json.dumps(v))
    v["pal-norms"]["deadline-rules"]["items"] = [r for r in v["pal-norms"]["deadline-rules"]["items"]
                                                 if r["id"] != "789n-inpatient"]
    res = export.build_all(ROOT, today=TODAY, v=v)
    ids = {(u["dataset"], u["id"], u["why"]) for u in res["rows"]["pack"][0]["unverified"]}
    assert ("deadline-rules", "789n-inpatient", "правила нет в снимке pal-norms") in ids
    assert "unknown_rule" in {f.code for f in res["lint"]}


def test_short_authority_names_go_to_genitive():
    from pipeline.resolve import authority_genitive
    assert authority_genitive("Минздрав России") == "Минздрава России"
    assert authority_genitive("Минздрав России и Минтруд России") == "Минздрава России и Минтруда России"
    assert authority_genitive("Минздравсоцразвития России") == "Минздравсоцразвития России"
    assert authority_genitive("Правительство Российской Федерации") == "Правительства Российской Федерации"


def _real_rules():
    path = ROOT / "vendor" / "pal-norms" / "v1" / "deadline-rules.json"
    return {r["id"]: r for r in json.loads(path.read_text(encoding="utf-8"))["items"]}


def test_obligation_milestones_point_to_verified_rules(built):
    rules = _real_rules()
    for t in built["rows"]["turning18"]:
        if t["kind"] == "obligation_mo" and t["verified"] is True:
            assert t["rule_id"] and rules[t["rule_id"]]["verified"] is True, t["id"]
            assert t["verified_at"], t["id"]
        if t["kind"] == "fact" and t["verified"] is True:
            assert t["norm_refs"], t["id"]
        assert "должна" not in t["label"], t["id"]


def test_complaints_hint_higher_addressee(built):
    for doc_id in ("deadline-complaint", "repeat-complaint"):
        d = docs(built)[doc_id]
        assert "mo_head" not in d["addressee_kinds"]
        hint = next(f for f in d["fields"] if f["id"] == "addressee_name")["hint"]
        assert "главному врачу" not in hint
        assert "Росздравнадзора" in hint and "министру здравоохранения" in hint and "прокурору" in hint


def test_no_internal_names_or_entitlement_words():
    bad = re.compile(r"FINAL_v2|положен[аоы]\b")
    for base in ("data", "content", "pipeline"):
        for p in (ROOT / base).rglob("*"):
            if p.is_file() and p.suffix in {".yaml", ".md", ".py"} and "tests" not in p.parts:
                assert not bad.search(p.read_text(encoding="utf-8")), p


def test_every_unverified_row_has_reason(built):
    rows = built["rows"]["pack"][0]["unverified"]
    assert rows
    for r in rows:
        assert r["why"].strip(), r
    missing = [r for r in rows if r["id"] == "rzn-missing"]
    regions = vendor.items(built["vendor"], "pal-directory", "regions")
    rzn = {a["region_id"] for a in vendor.items(built["vendor"], "pal-directory", "addressees") if a["agency"] == "rzn"}
    if any(r["id"] not in rzn for r in regions):
        assert missing and missing[0]["label"].startswith("Территориального органа Росздравнадзора нет в данных РЗН")
