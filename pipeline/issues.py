import argparse
import json
import subprocess
import sys
from pathlib import Path

LABEL_COLORS = {"review:legal": "B60205", "facts": "0E8A16"}


def run(cmd: list[str], dry: bool) -> str:
    if dry:
        print("$ " + " ".join(cmd))
        return "[]"
    return subprocess.run(cmd, capture_output=True, text=True, check=True).stdout


def open_issue(item: dict, dry: bool) -> bool:
    found = json.loads(run(["gh", "issue", "list", "--state", "open", "--search",
                            f"ok-review:{item['key']} in:title", "--json", "number"], dry) or "[]")
    if found:
        return False
    cmd = ["gh", "issue", "create", "--title", item["title"], "--body", item["body"]]
    for label in item.get("labels", []):
        cmd += ["--label", label]
    run(cmd, dry)
    return True


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="issues", description="Открыть issue по отчёту, без дублей")
    ap.add_argument("reports", nargs="+")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args(argv)
    for label, color in LABEL_COLORS.items():
        run(["gh", "label", "create", label, "--color", color, "--force"], a.dry_run)
    created = 0
    for rep in a.reports:
        p = Path(rep)
        if not p.is_file():
            continue
        for item in json.loads(p.read_text(encoding="utf-8")).get("items", []):
            created += open_issue(item, a.dry_run)
    print(f"issues: новых {created}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
