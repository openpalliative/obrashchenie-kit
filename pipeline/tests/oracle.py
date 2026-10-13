import datetime as dt
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
D = dt.timedelta(days=1)


class Calendar:
    def __init__(self, env: dict):
        self.items = env["items"]
        self.years = {i["year"]: i for i in self.items if i["kind"] == "year"}
        self.base = next(i for i in self.items if i["kind"] == "baseline")
        self._sets: dict = {}

    def sets(self, year: int):
        if year not in self._sets:
            y = self.years.get(year)
            if y and y.get("off") is not None:
                self._sets[year] = ({dt.date.fromisoformat(x) for x in y["off"]},
                                    {dt.date.fromisoformat(x) for x in y.get("work", [])}, y["verified"] is True)
            else:
                hol = {dt.date(year, int(m[:2]), int(m[3:])) for m in self.base["holidays_mmdd"]}
                excl = {dt.date(year, int(m[:2]), int(m[3:])) for m in self.base["carry_exclude_mmdd"]}
                off = set(hol)
                for h in sorted(hol):
                    if h.weekday() >= 5 and h not in excl:
                        d = h + D
                        while d.weekday() >= 5 or d in off:
                            d += D
                        off.add(d)
                self._sets[year] = (off, set(), False)
        return self._sets[year]

    def working(self, d: dt.date) -> bool:
        off, work, _ = self.sets(d.year)
        return d in work or (d.weekday() < 5 and d not in off)

    def verified(self, a: dt.date, b: dt.date) -> bool:
        lo, hi = min(a, b), max(a, b)
        return all(self.sets(y)[2] for y in range(lo.year, hi.year + 1))

    def add_working(self, d: dt.date, n: int) -> dt.date:
        step = -D if n < 0 else D
        left = abs(n)
        while left:
            d += step
            if self.working(d):
                left -= 1
        return d


def load_calendar(root: Path = ROOT) -> Calendar:
    p = root / "tests" / "fixtures" / "vendor" / "pal-norms" / "v1" / "calendar.json"
    return Calendar(json.loads(p.read_text(encoding="utf-8")))


def answer_due(cal: Calendar, start: dt.date, pre: int, days: int) -> tuple[dt.date, dt.date | None]:
    due = start + (pre + days) * D
    if cal.working(due):
        return due, None
    alt = due
    while not cal.working(alt):
        alt += D
    return due, alt


def backward(cal: Calendar, event: dt.date, n: int, margin: int) -> tuple[dt.date, int]:
    d, count = event, 0
    while count < n:
        d -= D
        if cal.working(d):
            count += 1
    if not cal.verified(d, event) and margin:
        return cal.add_working(d, -margin), margin
    return d, 0
