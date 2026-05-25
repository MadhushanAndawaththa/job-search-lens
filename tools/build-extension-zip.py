from __future__ import annotations

import json
from pathlib import Path
import zipfile


ROOT = Path(__file__).resolve().parent.parent
MANIFEST_PATH = ROOT / "manifest.json"
DIST_DIR = ROOT / "dist"

PACKAGE_FILES = [
    "manifest.json",
    "background.js",
    "content.js",
    "dom-heuristics.js",
    "shared.js",
    "popup.html",
    "popup.js",
    "theme-init.js",
    "styles.css",
    "LICENSE",
]

PACKAGE_DIRECTORIES = [
    "assets/icons",
]


def get_version() -> str:
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    return manifest["version"]


def iter_package_paths() -> list[Path]:
    package_paths = [ROOT / rel_path for rel_path in PACKAGE_FILES]

    for rel_dir in PACKAGE_DIRECTORIES:
        package_paths.extend(
            path
            for path in sorted((ROOT / rel_dir).rglob("*"))
            if path.is_file()
        )

    missing_paths = [path for path in package_paths if not path.exists()]
    if missing_paths:
        missing_list = "\n".join(str(path.relative_to(ROOT)) for path in missing_paths)
        raise FileNotFoundError(f"Missing package paths:\n{missing_list}")

    return package_paths


def main() -> None:
    version = get_version()
    DIST_DIR.mkdir(exist_ok=True)
    zip_path = DIST_DIR / f"job-search-lens-v{version}.zip"

    if zip_path.exists():
        zip_path.unlink()

    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for path in iter_package_paths():
            archive.write(path, arcname=path.relative_to(ROOT).as_posix())

    print(f"wrote {zip_path.relative_to(ROOT)} ({zip_path.stat().st_size} bytes)")


if __name__ == "__main__":
    main()