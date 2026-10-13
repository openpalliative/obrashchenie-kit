import calendar
import datetime as dt
import json

import yaml

from pipeline import export

from .conftest import ROOT, TODAY
from .oracle import answer_due, backward, load_calendar

F = dt.date.fromisoformat


def golden(name):
    return yaml.safe_load((ROOT / "tests" / "golden" / f"{name}.yaml").read_text(encoding="utf-8"))


def test_json_twins_match_yaml():
    for name in ("case-deadlines", "turning18"):
        j = json.loads((ROOT / "tests" / "golden" / f"{name}.json").read_text(encoding="utf-8"))
        assert j == golden(name)


def test_calendar_matches_decrees():
    cal = load_calendar()
    assert not cal.working(F("2026-01-09")) and not cal.working(F("2026-12-31"))
    assert not cal.working(F("2026-03-09")) and not cal.working(F("2026-05-11"))
    assert cal.working(F("2027-02-20")) and not cal.working(F("2027-02-22"))
    assert not cal.working(F("2027-11-05")) and not cal.working(F("2027-05-03"))
    assert cal.working(F("2025-11-01")) and not cal.working(F("2025-11-03"))
    assert not cal.working(F("2025-05-08")) and not cal.working(F("2025-06-13"))


def test_compute_cases_against_oracle():
    cal = load_calendar()
    rules = {r["id"]: r for r in json.loads((ROOT / golden("case-deadlines")["rules"]).read_text())["items"]}
    for c in golden("case-deadlines")["compute"]:
        r, start, exp = rules[c["rule_id"]], F(c["start"]), c["expect"]
        if r["direction"] == "backward":
            due, margin = backward(cal, start, r["value"], r["margin_working_days"])
            assert (due.isoformat(), margin) == (exp["due"], exp["margin_applied"]), c["id"]
        elif r["unit"] == "calendar_days":
            due, alt = answer_due(cal, start, (r["pre"] or {}).get("value", 0), r["value"])
            assert due.isoformat() == exp["due"], c["id"]
            assert (alt.isoformat() if alt else None) == exp["due_alt"], c["id"]
        elif r["unit"] == "working_days":
            assert cal.add_working(start, r["value"]).isoformat() == exp["due"], c["id"]
        latest = max(F(exp["due"]), F(exp["due_alt"])) if exp["due_alt"] else F(exp["due"])
        assert latest.isoformat() == exp["latest"], c["id"]
        assert cal.verified(min(start, latest), max(start, latest)) == exp["calendar_verified"], c["id"]


def months_back(d: dt.date, n: int) -> dt.date:
    y, m = divmod(d.year * 12 + d.month - 1 - n, 12)
    return dt.date(y, m + 1, min(d.day, calendar.monthrange(y, m + 1)[1]))


def test_turning18_cases_against_oracle(built):
    cal = load_calendar()
    items = {i["id"]: i for i in built["rows"]["turning18"]}
    for c in golden("turning18")["cases"]:
        b = F(c["birth"])
        b18 = b.replace(year=b.year + 18)
        exp = c["expect"]
        assert exp["birthday-18"]["date"] == b18.isoformat()
        due, _ = backward(cal, b18, 90, 5)
        assert exp["p23-extract"]["date"] == due.isoformat(), c["birth"]
        assert exp["p23-extract"]["margin_date"] == cal.add_working(due, -items["p23-extract"]["margin_wd"]).isoformat()
        assert exp["p23-extract"]["calendar_verified"] == cal.verified(due, b18)
        for oid in ("representation-orientir", "mse-orientir"):
            assert exp[oid]["date"] == months_back(b18, items[oid]["offset"]).isoformat(), (c["birth"], oid)


def test_2028_not_later_than_weekends_only():
    cal = load_calendar()
    b18 = F("2028-03-01")
    due, _ = backward(cal, b18, 90, 5)
    d, n = b18, 0
    while n < 90:
        d -= dt.timedelta(days=1)
        if d.weekday() < 5:
            n += 1
    assert due <= d


def test_today_constant_is_fixed():
    assert TODAY == dt.date(2026, 10, 11)
    assert export.REPO == "obrashchenie-kit"
