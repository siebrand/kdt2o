from __future__ import annotations

import os
from pathlib import Path
import subprocess
import sys


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "release.py"


def run_git(repo: Path, *args: str, env: dict[str, str] | None = None) -> str:
    result = subprocess.run(
        ["git", *args],
        cwd=repo,
        check=True,
        capture_output=True,
        text=True,
        env=env,
    )
    return result.stdout.strip()


def run_release(repo: Path, *args: str) -> str:
    result = subprocess.run(
        [sys.executable, str(SCRIPT), *args],
        cwd=repo,
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout.strip()


def init_repo(path: Path) -> Path:
    path.mkdir()
    run_git(path, "init", "--quiet", "--initial-branch=main")
    run_git(path, "config", "user.name", "Release Test")
    run_git(path, "config", "user.email", "release-test@example.invalid")
    return path


def commit_file(repo: Path, name: str, content: str, timestamp: str) -> str:
    (repo / name).write_text(content, encoding="utf-8")
    run_git(repo, "add", name)
    env = os.environ.copy()
    env["GIT_AUTHOR_DATE"] = timestamp
    env["GIT_COMMITTER_DATE"] = timestamp
    run_git(repo, "commit", "--quiet", "-m", f"Add {name}", env=env)
    return run_git(repo, "rev-parse", "HEAD")


def test_versions_sort_by_iso_date_then_commit_count(tmp_path: Path):
    repo = init_repo(tmp_path / "repo")
    first = commit_file(repo, "first.txt", "first", "2026-11-16T10:00:00+01:00")
    second = commit_file(repo, "second.txt", "second", "2026-11-16T11:00:00+01:00")
    third = commit_file(repo, "third.txt", "third", "2026-11-17T00:01:00+01:00")

    versions = [
        run_release(repo, "version", "--ref", commit)
        for commit in (first, second, third)
    ]

    assert versions == [
        f"2026-11-16.000000000001-{first}",
        f"2026-11-16.000000000002-{second}",
        f"2026-11-17.000000000003-{third}",
    ]
    assert versions == sorted(versions)
    assert run_release(repo, "verify", "--version", versions[-1]) == versions[-1]


def test_sibling_commits_with_same_date_and_count_get_unique_versions(tmp_path: Path):
    repo = init_repo(tmp_path / "repo")
    root = commit_file(repo, "root.txt", "root", "2026-11-03T10:00:00+01:00")
    main_commit = commit_file(repo, "main.txt", "main", "2026-11-16T10:00:00+01:00")
    run_git(repo, "switch", "--quiet", "--create", "sibling", root)
    sibling_commit = commit_file(repo, "sibling.txt", "sibling", "2026-11-16T10:00:00+01:00")

    main_version = run_release(repo, "version", "--ref", main_commit)
    sibling_version = run_release(repo, "version", "--ref", sibling_commit)

    assert main_version.startswith("2026-11-16.000000000002-")
    assert sibling_version.startswith("2026-11-16.000000000002-")
    assert main_version != sibling_version


def test_verify_rejects_a_version_for_another_commit(tmp_path: Path):
    repo = init_repo(tmp_path / "repo")
    commit = commit_file(repo, "source.txt", "source", "2026-11-16T10:00:00+01:00")
    version = run_release(repo, "version", "--ref", commit)
    wrong_version = version[:-1] + ("0" if version[-1] != "0" else "1")

    result = subprocess.run(
        [sys.executable, str(SCRIPT), "verify", "--version", wrong_version],
        cwd=repo,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 1
    assert "Checked-out commit is" in result.stderr


def test_tag_all_commits_is_idempotent(tmp_path: Path):
    repo = init_repo(tmp_path / "repo")
    first = commit_file(repo, "first.txt", "first", "2026-11-16T10:00:00+01:00")
    second = commit_file(repo, "second.txt", "second", "2026-11-16T11:00:00+01:00")

    assert run_release(repo, "tag-all") == "Created 2 version tag(s); 0 already existed."
    assert run_release(repo, "tag-all") == "Created 0 version tag(s); 2 already existed."
    assert run_git(repo, "tag", "--sort=refname").splitlines() == [
        run_release(repo, "version", "--ref", first),
        run_release(repo, "version", "--ref", second),
    ]


def test_release_notes_use_only_the_matching_changelog_section(tmp_path: Path):
    repo = init_repo(tmp_path / "repo")
    (repo / "public").mkdir()
    (repo / "public" / "CHANGELOG.md").write_text(
        """# Wijzigingen

## 16 november 2026

- Een wijziging voor gebruikers.

## 13 november 2026

- Een oudere wijziging.
""",
        encoding="utf-8",
    )
    commit = commit_file(repo, "source.txt", "release", "2026-11-16T10:00:00+01:00")
    version = run_release(repo, "version", "--ref", commit)

    notes = run_release(repo, "notes", "--version", version)

    assert f"# Versie {version}" in notes
    assert "- Een wijziging voor gebruikers." in notes
    assert "- Een oudere wijziging." not in notes
    assert "sbom.spdx.json" in notes


def test_release_notes_handle_dates_without_a_changelog_entry(tmp_path: Path):
    repo = init_repo(tmp_path / "repo")
    (repo / "public").mkdir()
    (repo / "public" / "CHANGELOG.md").write_text("# Wijzigingen\n", encoding="utf-8")
    commit = commit_file(repo, "source.txt", "internal", "2026-11-17T10:00:00+01:00")
    version = run_release(repo, "version", "--ref", commit)

    notes = run_release(repo, "notes", "--version", version)

    assert "geen gebruikersgerichte wijzigingen" in notes
    assert "changelog.html" in notes
