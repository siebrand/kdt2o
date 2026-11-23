#!/usr/bin/env python3
"""Add the deployed version to the asset URLs of the static pages.

Usage: stamp_assets.py SITE_DIR

GitHub Pages lets browsers cache every file for some minutes and cannot be
configured. The deployment workflow writes the CalVer version to
SITE_DIR/version.txt and then runs this script. It sets the query string
?v=<version> on every local script and stylesheet URL in SITE_DIR/*.html and
on every relative module import in SITE_DIR/*.js, so a new deployment loads a
matching set of assets instead of a mix of cached and new files. All imports of
a module get the same URL, so the browser loads each module once. The files in
the repository carry no version query.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path
from urllib.parse import quote

ASSET_TAG = re.compile(r"<(?:script|link)\b[^>]*>", re.IGNORECASE)
ASSET_URL = re.compile(r'\b(src|href)="([^"]*)"')
NOT_LOCAL = re.compile(r"^(?:[a-z][a-z0-9+.-]*:|//|#)", re.IGNORECASE)
# import ... from "./x.js", export ... from "./x.js", import "./x.js", and import("./x.js").
MODULE_IMPORT = re.compile(r"""(\b(?:from|import)\s*\(?\s*)(["'])(\.{1,2}/[^"'?]+\.js)(?:\?[^"']*)?\2""")


def stamp_url(url: str, version: str) -> str:
    if not url or NOT_LOCAL.match(url):
        return url
    path = url.split("#", 1)[0].split("?", 1)[0]
    return f"{path}?v={quote(version, safe='')}"


def stamp_page(html: str, version: str) -> str:
    def stamp_tag(tag: re.Match[str]) -> str:
        return ASSET_URL.sub(lambda url: f'{url.group(1)}="{stamp_url(url.group(2), version)}"', tag.group(0))

    return ASSET_TAG.sub(stamp_tag, html)


def stamp_script(script: str, version: str) -> str:
    return MODULE_IMPORT.sub(
        lambda match: f"{match.group(1)}{match.group(2)}{match.group(3)}?v={quote(version, safe='')}{match.group(2)}",
        script,
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("site_dir", type=Path, help="the directory that is deployed, for example public")
    args = parser.parse_args()

    version_file = args.site_dir / "version.txt"
    version = version_file.read_text(encoding="utf-8").strip() if version_file.is_file() else ""
    if not version:
        print(f"{version_file}: no version; stamp the version before the assets", file=sys.stderr)
        return 1
    pages = sorted(args.site_dir.glob("*.html"))
    for page in pages:
        page.write_text(stamp_page(page.read_text(encoding="utf-8"), version), encoding="utf-8")
    scripts = sorted(args.site_dir.glob("*.js"))
    for script in scripts:
        script.write_text(stamp_script(script.read_text(encoding="utf-8"), version), encoding="utf-8")
    print(f"Stamped the asset URLs of {len(pages)} pages and the imports of {len(scripts)} scripts with version {version}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
