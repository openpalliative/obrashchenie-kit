import shutil
import sys
from pathlib import Path

from .vendor import NEEDED


def seed(root: Path, force: bool = False) -> list[str]:
    done = []
    for repo in NEEDED:
        dest = root / "vendor" / repo
        src = root / "tests" / "fixtures" / "vendor" / repo
        if not src.is_dir():
            continue
        if dest.is_dir() and any((dest / "v1").glob("*.json")) and not force:
            continue
        if dest.exists():
            shutil.rmtree(dest)
        shutil.copytree(src, dest)
        done.append(repo)
    return done


def main(argv=None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    done = seed(Path.cwd(), force="--force" in argv)
    for repo in done:
        print(f"vendor/{repo}: тестовый снимок из tests/fixtures/vendor, замените его через scripts/sync-data")
    if not done:
        print("vendor/ уже заполнен, ничего не меняю")
    return 0


if __name__ == "__main__":
    sys.exit(main())
