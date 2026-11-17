#!/usr/bin/env python3
"""Check that a running server sends the security headers on every path.

Usage: check_security_headers.py BASE_URL

The script requests each path in PATHS from BASE_URL and fails when a
response lacks one of the headers in REQUIRED_HEADERS. CI runs it against the
built container, because Nginx silently drops server-level headers in
location blocks that set their own headers.
"""

from __future__ import annotations

import argparse
import sys
import time
import urllib.error
import urllib.request


# One path per Nginx location block, plus the other asset types.
PATHS = [
    "/",
    "/index.html",
    "/changelog.html",
    "/privacy.html",
    "/app.js",
    "/styles.css",
    "/recipes.json",
    "/CHANGELOG.md",
    "/version.txt",
]
REQUIRED_HEADERS = [
    "Content-Security-Policy",
    "X-Content-Type-Options",
    "Referrer-Policy",
    "Permissions-Policy",
]


def fetch_headers(url: str, attempts: int = 20) -> dict[str, str]:
    for attempt in range(attempts):
        try:
            with urllib.request.urlopen(url, timeout=10) as response:
                return {name.lower(): value for name, value in response.headers.items()}
        except (urllib.error.URLError, ConnectionError):
            if attempt == attempts - 1:
                raise
            time.sleep(0.5)
    raise AssertionError("unreachable")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("base_url", help="for example http://127.0.0.1:8080")
    args = parser.parse_args()

    errors = []
    for path in PATHS:
        headers = fetch_headers(args.base_url.rstrip("/") + path)
        missing = [name for name in REQUIRED_HEADERS if name.lower() not in headers]
        if missing:
            errors.append(f"{path}: missing {', '.join(missing)}")
        if headers.get("x-content-type-options", "").lower() != "nosniff" and "X-Content-Type-Options" not in missing:
            errors.append(f"{path}: X-Content-Type-Options is not nosniff")
    for error in errors:
        print(error, file=sys.stderr)
    if errors:
        return 1
    print(f"All {len(PATHS)} paths send the required security headers.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
