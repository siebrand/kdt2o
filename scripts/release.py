"""Assign CalVer identities to commits and prepare release notes."""

from __future__ import annotations

import argparse
from datetime import date
from pathlib import Path
import re
import subprocess
import sys


REPOSITORY_URL = "https://github.com/siebrand/kdt2o"
CHANGELOG_URL = "https://siebrand.github.io/kdt2o/changelog.html"
VERSION_PATTERN = re.compile(
    r"(?P<date>[0-9]{4}-[0-9]{2}-[0-9]{2})\."
    r"(?P<count>[0-9]{12,})-(?P<commit>[0-9a-f]{40})\Z"
)
DUTCH_MONTHS = (
    "januari",
    "februari",
    "maart",
    "april",
    "mei",
    "juni",
    "juli",
    "augustus",
    "september",
    "oktober",
    "november",
    "december",
)


def _git(repo: Path, *args: str) -> str:
    result = subprocess.run(
        ["git", *args],
        cwd=repo,
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode:
        message = result.stderr.strip() or f"git {' '.join(args)} failed"
        raise RuntimeError(message)
    return result.stdout.strip()


def parse_version(version: str) -> tuple[date, int, str]:
    match = VERSION_PATTERN.fullmatch(version)
    if not match:
        raise ValueError(f"Invalid commit version: {version}")
    commit_date = date.fromisoformat(match.group("date"))
    return commit_date, int(match.group("count")), match.group("commit")


def version_for(ref: str = "HEAD", repo: Path | None = None) -> str:
    root = (repo or Path.cwd()).resolve()
    commit = _git(root, "rev-parse", "--verify", f"{ref}^{{commit}}")
    commit_date = date.fromisoformat(_git(root, "show", "-s", "--format=%cs", commit))
    count = int(_git(root, "rev-list", "--count", commit))
    return f"{commit_date.isoformat()}.{count:012d}-{commit}"


def verify_version(version: str, ref: str = "HEAD", repo: Path | None = None) -> str:
    actual = version_for(ref, repo)
    if version != actual:
        raise ValueError(f"Checked-out commit is {actual}, not {version}")
    return actual


def tag_all_commits(repo: Path | None = None) -> tuple[int, int]:
    root = (repo or Path.cwd()).resolve()
    commits = _git(root, "rev-list", "--reverse", "HEAD").splitlines()
    created = 0
    existing = 0
    for commit in commits:
        version = version_for(commit, root)
        tagged_commit = subprocess.run(
            ["git", "rev-parse", "--verify", f"refs/tags/{version}^{{commit}}"],
            cwd=root,
            capture_output=True,
            text=True,
        )
        if tagged_commit.returncode == 0:
            if tagged_commit.stdout.strip() != commit:
                raise RuntimeError(f"Version tag {version} points to a different commit")
            existing += 1
            continue
        subprocess.run(
            ["git", "tag", "--annotate", version, commit, "--message", f"Version {version}"],
            cwd=root,
            check=True,
            capture_output=True,
            text=True,
        )
        created += 1
    return created, existing


def changelog_section(changelog: str, commit_date: date) -> str:
    heading = f"## {commit_date.day} {DUTCH_MONTHS[commit_date.month - 1]} {commit_date.year}"
    lines = changelog.splitlines()
    try:
        start = lines.index(heading) + 1
    except ValueError:
        return ""
    end = next((index for index in range(start, len(lines)) if lines[index].startswith("## ")), len(lines))
    return "\n".join(lines[start:end]).strip()


def make_release_notes(version: str, changelog: str) -> str:
    commit_date, _, commit = parse_version(version)
    date_heading = f"{commit_date.day} {DUTCH_MONTHS[commit_date.month - 1]} {commit_date.year}"
    changes = changelog_section(changelog, commit_date)
    if not changes:
        changes = "Voor deze datum staan geen gebruikersgerichte wijzigingen in het wijzigingenoverzicht."
    return "\n".join(
        (
            f"# Versie {version}",
            "",
            f"## Gebruikerswijzigingen — {date_heading}",
            "",
            changes,
            "",
            f"[Bekijk het volledige wijzigingenoverzicht]({CHANGELOG_URL}).",
            "",
            f"Commit: [`{commit[:12]}`]({REPOSITORY_URL}/commit/{commit}).",
            "",
            "De SBOM voor de gebouwde Nginx-container is bij deze release gevoegd als `sbom.spdx.json`.",
        )
    )


def release_notes_for(ref: str = "HEAD", repo: Path | None = None) -> str:
    root = (repo or Path.cwd()).resolve()
    version = version_for(ref, root)
    changelog = (root / "public" / "CHANGELOG.md").read_text(encoding="utf-8")
    return make_release_notes(version, changelog)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    version_command = commands.add_parser("version", help="print a deterministic version for a commit")
    version_command.add_argument("--ref", default="HEAD")
    commands.add_parser("tag-all", help="create version tags for all commits reachable from HEAD")
    verify_command = commands.add_parser("verify", help="verify a version against a commit")
    verify_command.add_argument("--version", required=True)
    verify_command.add_argument("--ref", default="HEAD")
    notes_command = commands.add_parser("notes", help="generate release notes from the canonical changelog")
    notes_command.add_argument("--version", required=True)
    args = parser.parse_args(argv)
    root = Path.cwd()

    try:
        if args.command == "version":
            print(version_for(args.ref, root))
        elif args.command == "tag-all":
            created, existing = tag_all_commits(root)
            print(f"Created {created} version tag(s); {existing} already existed.")
        elif args.command == "verify":
            print(verify_version(args.version, args.ref, root))
        else:
            verify_version(args.version, "HEAD", root)
            print(release_notes_for("HEAD", root))
    except (RuntimeError, ValueError, subprocess.CalledProcessError) as error:
        print(f"release: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
