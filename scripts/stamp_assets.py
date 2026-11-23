#!/usr/bin/env python3
"""Add the deployed version to the asset URLs of the static pages.

Usage: stamp_assets.py SITE_DIR

GitHub Pages lets browsers cache every file for some minutes and cannot be
configured. The deployment workflow writes the CalVer version to
SITE_DIR/version.txt and then runs this script. It sets the query string
?v=<version> on every local script and stylesheet URL in SITE_DIR/*.html, so a
new deployment loads a matching set of assets instead of a mix of cached and
new files. The pages in the repository carry no version query.
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


def stamp_url(url: str, version: str) -> str:
    if not url or NOT_LOCAL.match(url):
        return url
    path = url.split("#", 1)[0].split("?", 1)[0]
    return f"{path}?v={quote(version, safe='')}"


def stamp_page(html: str, version: str) -> str:
    def stamp_tag(tag: re.Match[str]) -> str:
        return ASSET_URL.sub(lambda url: f'{url.group(1)}="{stamp_url(url.group(2), version)}"', tag.group(0))

    return ASSET_TAG.sub(stamp_tag, html)


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
    print(f"Stamped the asset URLs of {len(pages)} pages with version {version}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
