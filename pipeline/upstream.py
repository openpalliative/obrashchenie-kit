import datetime as dt
import json
import sys
from pathlib import Path

from . import vendor


def snapshot(root: Path, today: dt.date | None = None) -> dict:
    today = today or dt.date.today()
    v = vendor.load(root)
    rows = []
    for repo, envs in sorted(v.items()):
        for name, env in sorted(envs.items()):
            rows.append({"repo": repo, "dataset": name, "version": env["version"], "data_date": env["data_date"],
                         "content_sha256": env["content_sha256"], "fixture": vendor.is_fixture(env)})
    return {"checked_at": today.isoformat(), "neighbors": rows}


def main(argv=None) -> int:
    root = Path.cwd()
    out = root / "data" / "snapshots" / "upstream.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    data = snapshot(root)
    out.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"{out.relative_to(root)}: снимков {len(data['neighbors'])}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
