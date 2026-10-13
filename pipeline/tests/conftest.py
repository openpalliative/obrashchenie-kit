import datetime as dt
import os
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
FIX = Path(__file__).resolve().parent / "fixtures"
TODAY = dt.date(2026, 10, 11)


@pytest.fixture(autouse=True)
def fixture_vendor(monkeypatch):
    monkeypatch.setenv("OK_VENDOR", "fixtures")
    monkeypatch.chdir(ROOT)
    yield


@pytest.fixture(scope="session")
def built():
    os.environ["OK_VENDOR"] = "fixtures"
    from pipeline import export
    return export.build_all(ROOT, today=TODAY)
