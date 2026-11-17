#!/usr/bin/env python3
"""Check the security rules for the public pages and the Nginx configuration.

GitHub Pages cannot send custom headers, so every page in public/ declares the
Content Security Policy and the referrer policy in <meta> elements. The
canonical policy is in nginx/security-headers.conf. The check fails when:

- a page has no CSP <meta> element as the first element after <meta charset>,
- the page CSP differs from the Nginx CSP without frame-ancestors, which
  browsers ignore in a <meta> element,
- a page has no <meta name="referrer" content="no-referrer">,
- a page loads a script, stylesheet, or frame from another host,
- a page has an inline <script>, an inline <style>, a style attribute, or an
  on* event handler attribute, which the CSP blocks,
- an Nginx location block sets add_header without including the snippet.
"""

from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path
import re
import sys


ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"
SNIPPET = ROOT / "nginx" / "security-headers.conf"
NGINX = ROOT / "nginx.conf"
SNIPPET_INCLUDE = "include /etc/nginx/snippets/security-headers.conf;"
EXTERNAL = re.compile(r"^(?:[a-z][a-z0-9+.-]*:)?//", re.IGNORECASE)


def nginx_csp() -> str:
    match = re.search(r'add_header Content-Security-Policy "([^"]+)"', SNIPPET.read_text(encoding="utf-8"))
    if not match:
        raise SystemExit(f"{SNIPPET.relative_to(ROOT)}: no Content-Security-Policy header")
    return match.group(1)


def meta_csp(header_csp: str) -> str:
    directives = [d.strip() for d in header_csp.split(";") if d.strip()]
    return "; ".join(d for d in directives if not d.startswith("frame-ancestors"))


class PageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.head_elements: list[tuple[str, dict[str, str]]] = []
        self.in_head = False
        self.problems: list[str] = []
        self.inline_script = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = {name.lower(): value or "" for name, value in attrs}
        if tag == "head":
            self.in_head = True
        elif self.in_head:
            self.head_elements.append((tag, values))
        for name in values:
            if name.startswith("on"):
                self.problems.append(f"<{tag}> has an inline event handler {name}=")
        if "style" in values:
            self.problems.append(f"<{tag}> has a style attribute")
        if tag == "style":
            self.problems.append("inline <style> element")
        if tag == "script":
            source = values.get("src", "")
            if not source:
                self.problems.append("inline <script> element")
            elif EXTERNAL.match(source):
                self.problems.append(f"<script> loads {source} from another host")
        if tag == "link" and "stylesheet" in values.get("rel", "") and EXTERNAL.match(values.get("href", "")):
            self.problems.append(f"<link> loads {values['href']} from another host")
        if tag in {"iframe", "frame", "embed", "object"}:
            self.problems.append(f"<{tag}> element")

    def handle_endtag(self, tag: str) -> None:
        if tag == "head":
            self.in_head = False


def check_page(path: Path, expected_csp: str) -> list[str]:
    parser = PageParser()
    parser.feed(path.read_text(encoding="utf-8"))
    problems = list(parser.problems)
    metas = [(tag, attrs) for tag, attrs in parser.head_elements if tag == "meta"]
    charset_index = next((i for i, (tag, attrs) in enumerate(parser.head_elements) if tag == "meta" and "charset" in attrs), None)
    csp = [attrs for _, attrs in metas if attrs.get("http-equiv", "").lower() == "content-security-policy"]
    if not csp:
        problems.append("no Content-Security-Policy <meta> element")
    else:
        if csp[0].get("content", "") != expected_csp:
            problems.append(f"CSP differs from nginx/security-headers.conf; expected: {expected_csp}")
        position = parser.head_elements.index(("meta", csp[0]))
        if charset_index is None or position != charset_index + 1:
            problems.append("the CSP <meta> element must directly follow <meta charset>")
    referrer = [attrs for _, attrs in metas if attrs.get("name", "").lower() == "referrer"]
    if not referrer or referrer[0].get("content") != "no-referrer":
        problems.append('no <meta name="referrer" content="no-referrer">')
    return [f"{path.relative_to(ROOT)}: {problem}" for problem in problems]


def check_nginx() -> list[str]:
    problems = []
    for match in re.finditer(r"location\s+[^{]+\{(.*?)\n  \}", NGINX.read_text(encoding="utf-8"), re.S):
        block = match.group(1)
        if "add_header" in block and SNIPPET_INCLUDE not in block:
            location = match.group(0).splitlines()[0].strip()
            problems.append(f"nginx.conf: '{location}' sets add_header without '{SNIPPET_INCLUDE}'")
    return problems


def main() -> int:
    expected = meta_csp(nginx_csp())
    problems = check_nginx()
    pages = sorted(PUBLIC.glob("*.html"))
    for page in pages:
        problems.extend(check_page(page, expected))
    for problem in problems:
        print(problem, file=sys.stderr)
    if problems:
        return 1
    print(f"{len(pages)} pages and nginx.conf follow the security rules.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
