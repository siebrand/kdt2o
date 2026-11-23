from __future__ import annotations

import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "stamp_assets.py"
VERSION = "2026-11-23.000000000412-" + "b" * 40
ASSET_URLS = re.compile(r'<(?:script|link)\b[^>]*\b(?:src|href)="([^"]*)"', re.IGNORECASE)


def copy_site(target: Path, version: str | None) -> Path:
    target.mkdir()
    for page in (ROOT / "public").glob("*.html"):
        shutil.copy(page, target / page.name)
    if version is not None:
        (target / "version.txt").write_text(version + "\n", encoding="utf-8")
    return target


def stamp(site: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run([sys.executable, str(SCRIPT), str(site)], capture_output=True, text=True)


def test_repository_pages_have_no_manual_asset_versions():
    for page in (ROOT / "public").glob("*.html"):
        for url in ASSET_URLS.findall(page.read_text(encoding="utf-8")):
            assert "?" not in url, f"{page.name}: {url} has a version; the deployment adds it"


def test_every_local_asset_gets_the_deployed_version(tmp_path: Path):
    site = copy_site(tmp_path / "site", VERSION)
    assert stamp(site).returncode == 0
    for page in site.glob("*.html"):
        html = page.read_text(encoding="utf-8")
        urls = ASSET_URLS.findall(html)
        assert urls, page.name
        for url in urls:
            assert url.endswith(f"?v={VERSION}"), f"{page.name}: {url}"
        original = (ROOT / "public" / page.name).read_text(encoding="utf-8")
        # Only the asset URLs change; links in the page text stay as they are.
        assert ASSET_URLS.sub("", html).count("href=") == ASSET_URLS.sub("", original).count("href=")
        assert re.sub(r"\?v=[^\"]*", "", html) == original


def test_stamping_twice_keeps_one_version(tmp_path: Path):
    site = copy_site(tmp_path / "site", VERSION)
    assert stamp(site).returncode == 0
    (site / "version.txt").write_text("2026-11-24.000000000413-" + "c" * 40, encoding="utf-8")
    assert stamp(site).returncode == 0
    for page in site.glob("*.html"):
        for url in ASSET_URLS.findall(page.read_text(encoding="utf-8")):
            assert url.count("?v=") == 1 and url.endswith("c" * 40), url


def test_stamping_without_version_fails(tmp_path: Path):
    site = copy_site(tmp_path / "site", None)
    result = stamp(site)
    assert result.returncode == 1
    assert "no version" in result.stderr
