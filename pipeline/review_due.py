import argparse
import datetime as dt
import hashlib
import json
import sys
from pathlib import Path

from opsite.data import BuildError, coerce, read_yaml

from . import source, vendor

RECHECK_DAYS = 180
ARCHIVE_DAYS = 90
STALE_DAYS = 90
CALENDAR_MONTH = 10


def _d(value) -> dt.date | None:
    if not value:
        return None
    try:
        return dt.date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def _item(kind: str, ident: str, title: str, body: str, labels: list[str]) -> dict:
    key = hashlib.sha256(f"{kind}:{ident}".encode()).hexdigest()[:12]
    return {"kind": kind, "key": key, "title": f"{title} [ok-review:{key}]", "body": body, "labels": labels}


def check(pack_meta: dict, rows: dict, v: dict, today: dt.date) -> list[dict]:
    out = []
    released = _d(pack_meta.get("released_at"))
    expires = int(pack_meta.get("expires_after_days") or 365)
    if released and (today - released).days > expires:
        out.append(_item("pack_expired", pack_meta["id"], f"Пакет {pack_meta['id']} старше {expires} дней",
                         f"Пакет выпущен {released.isoformat()}. Нужна сверка текстов и новый выпуск пакета.",
                         ["review:legal"]))
    stale_rows = []
    for name in ("channels", "addressees-federal"):
        for r in rows.get(name, []):
            at = _d(r.get("verified_at"))
            if r.get("verified") is not True or at is None or (today - at).days > RECHECK_DAYS:
                stale_rows.append(f"- {name}: {r['id']} ({r.get('label', '')}), проверено: {at or 'нет'}")
    if stale_rows:
        out.append(_item("recheck", "channels-addressees",
                         "Каналы подачи и федеральные адресаты не сверены",
                         "Сверить мейнтейнеру в РФ (сайты ведомств проект не открывает):\n" + "\n".join(stale_rows),
                         ["review:legal"]))
    if today.month >= CALENDAR_MONTH:
        cal = vendor.items(v, "pal-norms", "calendar")
        nxt = today.year + 1
        if not any(c.get("year") == nxt and c.get("verified") is True for c in cal):
            out.append(_item("calendar_missing", str(nxt), f"Нет проверенного календаря на {nxt} год",
                             f"В снимке pal-norms нет года {nxt} с verified:true. Сроки на {nxt} год показываются "
                             "со статусом «календарь не утверждён».", ["facts"]))
    first = _d(pack_meta.get("first_public_at"))
    if first and not pack_meta.get("reviewers") and (today - first).days > ARCHIVE_DAYS:
        out.append(_item("archive", pack_meta["id"], "Архивировать kit? Три месяца демо без юриста",
                         f"Пакет опубликован {first.isoformat()}, ревьюеров нет. Правило проекта: если 3 месяца после "
                         "публикации пакет не проверил юрист, инструмент уходит в архив, сроки и правила эскалации "
                         "остаются в pal-norms. Решает мейнтейнер.",
                         ["review:legal"]))
    for repo, envs in sorted(v.items()):
        for name, env in sorted(envs.items()):
            dd = _d(env.get("data_date"))
            if dd and (today - dd).days > STALE_DAYS:
                out.append(_item("stale_snapshot", f"{repo}/{name}", f"Снимок {repo}/{name} устарел",
                                 f"Данные от {dd.isoformat()}, это старше {STALE_DAYS} дней.", ["facts"]))
    return out


def load(root: Path) -> tuple[dict, dict, dict]:
    pack_dir = root / "data" / "pack"
    meta = read_yaml(pack_dir / "pack.yaml")
    meta = coerce(meta, source.item_schema(root, "pack"))
    pack = source.load_pack(pack_dir)
    rows = {
        "channels": source.coerce_rows(root, "channels", pack["channels"]),
        "addressees-federal": source.coerce_rows(root, "addressees-federal", pack["addressees-federal"]),
    }
    return meta, rows, vendor.load(root)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="review_due", description="Ежемесячные проверки сроков ревью")
    ap.add_argument("--today")
    ap.add_argument("--out", default="_reports/review.json")
    a = ap.parse_args(argv)
    root = Path.cwd()
    today = dt.date.fromisoformat(a.today) if a.today else dt.date.today()
    try:
        meta, rows, v = load(root)
    except BuildError as e:
        print(e, file=sys.stderr)
        return 1
    items = check(meta, rows, v, today)
    out = Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({"checked_at": today.isoformat(), "items": items}, ensure_ascii=False, indent=1),
                   encoding="utf-8")
    for it in items:
        print(f"{it['kind']}: {it['title']}")
    print(f"review_due: записей {len(items)}, отчёт {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
