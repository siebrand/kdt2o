# ADR 0006: Date-prefixed commit versions and releases

## Status

Accepted

## Context

The project needs a unique, sortable version for every commit on `main`, versioned release notes, an SBOM, and a way to restore an earlier GitHub Pages deployment. The browser application remains static, and `public/CHANGELOG.md` is the only maintained changelog source.

## Decision

Use deterministic CalVer tags in the form `YYYY-MM-DD.NNNNNNNNNNNN-<full-commit-SHA>`:

- `YYYY-MM-DD` is the commit's ISO committer date.
- `NNNNNNNNNNNN` is the 12-digit zero-padded number of commits reachable from that commit.
- The full SHA disambiguates sibling commits that have the same date and reachable-commit count.

Versions sort lexically by date, count, and SHA. This is CalVer, not SemVer. The version workflow creates annotated tags for every commit reachable from `main`, including untagged history, and verifies existing tags rather than moving them.

A maintainer prepares a draft GitHub Release by selecting a version tag in the **Create release draft** workflow. The workflow verifies the tag, builds the Nginx image, generates an SPDX SBOM for that image with Syft, and generates Dutch release notes from the matching date section of `public/CHANGELOG.md`. The draft is reviewed and published manually. The SBOM describes container contents; the browser-loaded jsPDF dependency remains external and is pinned in `public/index.html`.

The **Deploy GitHub Pages** workflow accepts a version tag for a manual rollback. It validates that the tag matches the checked-out commit before deploying that commit's `public/` directory.

## Consequences

- Versions are deterministic and assigned without a mutable version file or manual bump.
- Release notes remain derived from the canonical user-facing changelog; no second checked-in changelog is introduced.
- Version tags identify commits, but do not each create a GitHub Release. Releases are prepared explicitly as drafts to avoid publishing a release for every internal or documentation-only commit.
- GitHub Actions requires `contents: write` permission to create tags and draft releases.
- Only the current `main` branch is supported; historical tags are available for identification and rollback, not ongoing support.
