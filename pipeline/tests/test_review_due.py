import datetime as dt

from pipeline import review_due, vendor

from .conftest import ROOT


def synthetic():
    meta = {"id": "t0-demo", "released_at": "2025-01-01", "expires_after_days": 365, "first_public_at": "2026-01-01",
            "reviewers": []}
    rows = {"channels": [{"id": "ezp", "label": "ЭЗП", "verified": True, "verified_at": "2025-12-01"}],
            "addressees-federal": [{"id": "minzdrav-rf", "label": "Минздрав России", "verified": True,
                                    "verified_at": "2026-09-01"}]}
    v = vendor.load(ROOT, "fixtures")
    for envs in v.values():
        for env in envs.values():
            env["data_date"] = "2026-09-30"
    return meta, rows, v


def fresh_vendor(v, date="2027-09-30"):
    for envs in v.values():
        for env in envs.values():
            env["data_date"] = date
    return v


def test_four_records_on_synthetic():
    meta, rows, v = synthetic()
    items = review_due.check(meta, rows, fresh_vendor(v), dt.date(2027, 10, 5))
    assert sorted(i["kind"] for i in items) == ["archive", "calendar_missing", "pack_expired", "recheck"]


def test_nothing_due_when_fresh():
    meta, rows, v = synthetic()
    meta.update(released_at="2026-10-01", first_public_at=None)
    rows["channels"][0]["verified_at"] = "2026-09-01"
    assert review_due.check(meta, rows, v, dt.date(2026, 10, 6)) == []


def test_keys_are_stable():
    meta, rows, v = synthetic()
    v = fresh_vendor(v)
    a = review_due.check(meta, rows, v, dt.date(2027, 10, 5))
    b = review_due.check(meta, rows, v, dt.date(2027, 11, 2))
    assert {i["key"] for i in a if i["kind"] != "calendar_missing"} <= {i["key"] for i in b}


def test_stale_snapshot():
    meta, rows, v = synthetic()
    meta.update(released_at="2026-10-01", first_public_at=None)
    rows["channels"][0]["verified_at"] = "2026-09-01"
    v["pal-norms"]["acts"]["data_date"] = "2026-01-01"
    items = review_due.check(meta, rows, v, dt.date(2026, 10, 6))
    assert [i["kind"] for i in items] == ["stale_snapshot"]
