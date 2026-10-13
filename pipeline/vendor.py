import json
import os
from pathlib import Path

from opsite.data import BuildError

NEEDED = {
    "pal-norms": ["acts", "deadline-rules", "calendar", "escalation"],
    "pal-directory": ["regions", "addressees", "region-lines", "federal-lines"],
}
FIXTURE_PREFIX = "fixture-"


def mode() -> str:
    m = os.environ.get("OK_VENDOR", "auto")
    if m not in ("auto", "real", "fixtures"):
        raise BuildError(f"OK_VENDOR={m}: допустимо auto, real или fixtures")
    return m


def repo_dir(root: Path, repo: str, m: str | None = None) -> Path | None:
    m = m or mode()
    real = root / "vendor" / repo / "v1"
    fix = root / "tests" / "fixtures" / "vendor" / repo / "v1"
    if m != "fixtures" and real.is_dir() and any(real.glob("*.json")):
        return real
    if m == "real":
        return None
    return fix if fix.is_dir() else None


def load(root: Path, m: str | None = None) -> dict:
    out: dict = {}
    for repo, names in NEEDED.items():
        d = repo_dir(root, repo, m)
        if d is None:
            if (m or mode()) == "real":
                raise BuildError(f"нет снимка vendor/{repo}/v1: запустите scripts/sync-data")
            continue
        for name in names:
            p = d / f"{name}.json"
            if p.is_file():
                env = json.loads(p.read_text(encoding="utf-8"))
                if (m or mode()) == "real" and is_fixture(env):
                    raise BuildError(f"vendor/{repo}/v1/{name}.json: это тестовый снимок, для публикации нужен "
                                     "настоящий. Запустите scripts/sync-data")
                out.setdefault(repo, {})[name] = env
    return out


def is_fixture(env: dict) -> bool:
    return any(s.get("id", "").startswith(FIXTURE_PREFIX) for s in env.get("source", []))


def items(vendor: dict, repo: str, name: str) -> list[dict]:
    env = vendor.get(repo, {}).get(name)
    return env["items"] if env else []
