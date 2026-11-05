#!/usr/bin/env python3
"""Remove the redundant key field from ingredients and alternatives."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import shutil


def visit(value: object) -> int:
    count = 0
    if isinstance(value, dict):
        if {"raw", "name", "optional"}.issubset(value) and "key" in value:
            del value["key"]
            count += 1
        for child in value.values():
            count += visit(child)
    elif isinstance(value, list):
        for child in value:
            count += visit(child)
    return count


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("path", nargs="?", type=Path, default=Path("public/recipes.json"))
    parser.add_argument("--no-backup", action="store_true", help="Do not create a .bak backup")
    args = parser.parse_args()
    if not args.path.is_file():
        parser.error(f"file not found: {args.path}")
    if not args.no_backup:
        shutil.copy2(args.path, args.path.with_suffix(args.path.suffix + ".bak"))
    with args.path.open(encoding="utf-8") as handle:
        data = json.load(handle)
    count = visit(data)
    with args.path.open("w", encoding="utf-8") as handle:
        json.dump(data, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    print(f"Removed key from {count} ingredients in {args.path}")


if __name__ == "__main__":
    main()
