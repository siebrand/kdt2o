# ADR 0007: Automatic releases for newly pushed CalVer tags

## Status

Accepted

## Context

The **Version commits** workflow assigns a deterministic CalVer tag to each commit on `main`. Tags alone do not create
visible GitHub Releases, so the existing manual draft workflow left tags without a public release or SBOM. Publish
releases for newly pushed tags without backfilling existing tags.

## Decision

Publish a GitHub Release automatically for every newly pushed tag matching the CalVer pattern. The release workflow
validates that the tag identifies the expected commit, builds the Nginx image, generates an SPDX SBOM, and publishes the
release with Dutch notes from the matching section of `public/CHANGELOG.md` and `sbom.spdx.json` attached.

The version-tag workflow pushes tags using `WORKFLOW_PAT`, which causes the tag push to trigger the release workflow.
Existing tags are not backfilled: only tag-push events from this policy onward create releases.

## Consequences

- Every new commit tag, including commits containing only internal or documentation changes, gets a published release.
- Release assets become public immediately; releases are not held as drafts for manual review.
- Historical tags remain usable for rollback but do not receive releases automatically.
- The release workflow needs `contents: write`, and tag creation must use `WORKFLOW_PAT` to trigger it.
