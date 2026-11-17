#!/usr/bin/env python3
"""Copy browser libraries from node_modules to public/vendor/, or check them.

The site has no build step, so public/vendor/ contains committed copies of the
browser libraries in package.json. The copies keep the library off third-party
CDNs, and package.json lets Dependabot, the dependency graph, and npm audit
track the version.

Usage:
  npm ci --ignore-scripts
  python3 scripts/vendor_dependencies.py          # copy the files
  python3 scripts/vendor_dependencies.py --check  # fail if a copy differs

The check also fails when node_modules does not have the version that
package-lock.json locks.
"""

from __future__ import annotations

import argparse
import filecmp
import json
from pathlib import Path
import shutil
import sys


ROOT = Path(__file__).resolve().parent.parent
NODE_MODULES = ROOT / "node_modules"
VENDOR = ROOT / "public" / "vendor"

# package name -> list of (file in the package, file in public/vendor/)
FILES = {
    "jspdf": [
        ("dist/jspdf.umd.min.js", "jspdf.umd.min.js"),
        ("LICENSE", "jspdf.LICENSE.txt"),
    ],
}


def locked_version(package: str) -> str:
    lock = json.loads((ROOT / "package-lock.json").read_text(encoding="utf-8"))
    return lock["packages"][f"node_modules/{package}"]["version"]


def installed_version(package: str) -> str | None:
    manifest = NODE_MODULES / package / "package.json"
    if not manifest.exists():
        return None
    return json.loads(manifest.read_text(encoding="utf-8"))["version"]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--check", action="store_true", help="only check that the copies match")
    args = parser.parse_args()

    errors = []
    for package, files in FILES.items():
        locked = locked_version(package)
        installed = installed_version(package)
        if installed != locked:
            errors.append(f"{package}: node_modules has {installed or 'nothing'}, package-lock.json locks {locked}; run npm ci")
            continue
        for source, target in files:
            source_path = NODE_MODULES / package / source
            target_path = VENDOR / target
            if args.check:
                if not target_path.exists() or not filecmp.cmp(source_path, target_path, shallow=False):
                    errors.append(f"public/vendor/{target} does not match {package} {locked}; run scripts/vendor_dependencies.py")
            else:
                VENDOR.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(source_path, target_path)
                print(f"copied {package} {locked} {source} -> public/vendor/{target}")
    for error in errors:
        print(error, file=sys.stderr)
    if errors:
        return 1
    if args.check:
        print("public/vendor/ matches package-lock.json.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
