# Contributing

Thanks for contributing to Kitano meal planner, a static Dutch web application
for planning meals and generating a shopping-list PDF.

## Development setup

The project requires Docker for the full local workflow.

```bash
docker build -t kitano-meal-planner .
docker run --rm -p 8080:80 kitano-meal-planner
```

Open `http://localhost:8080` to test the application.

Install the Git hooks once per clone. They require
[pre-commit](https://pre-commit.com/), which installs the hook's own Python
dependencies.

```bash
pre-commit install
pre-commit run --all-files
```

The hooks validate `public/recipes.json` against `schemas/schema.json` and
additional rules in `scripts/validate_recipes.py` whenever recipe data, the
schema, or the validator changes. They also lint `.github/workflows/` with
actionlint 1.7.12 in a pinned Docker image, so no separate actionlint install is
needed. CI runs the same hooks on every push to `main` and on every pull request.

Browser smoke tests in `tests/test_browser.py` check loading at the site root
and under `/kdt2o/`, changelog rendering, planning, the shopping list, and the
PDF. They use Playwright for Python and run in CI. To run them locally with
[uv](https://docs.astral.sh/uv/):

```bash
uv run --no-project --with-requirements tests/requirements.txt python -m playwright install chromium
uv run --no-project --with-requirements tests/requirements.txt pytest tests
```

## Workflow

1. Create a focused branch from `main`.
2. Keep changes small and explain the user-visible impact.
3. Keep all user-visible text, PDF text, and errors in Dutch.
4. Keep code, commits, branches, issues, pull requests, and developer documentation in English.
5. Run the relevant validation, such as the pre-commit hooks and the Docker build, and include the results in the pull request.
6. Open a pull request against `main`.

## Version tags, releases, and rollback

The **Version commits** workflow creates a deterministic, date-prefixed CalVer tag for every commit reachable from
`main`. Tags use the commit's ISO committer date, a zero-padded reachable-commit count, and the full commit SHA; do not
create or move these tags manually.

To prepare a release, run **Create release draft** from GitHub Actions and enter the tag to release. It verifies the
version, builds the container, generates an SPDX SBOM, and creates a draft with notes sourced from the matching date
section of `public/CHANGELOG.md`. Review the notes and SBOM, then publish the draft on GitHub. The workflows require
`GITHUB_TOKEN` to have `contents: write` permission. Pages and release workflows stamp the CalVer into
`public/version.txt` before publishing it; the deployed identifier appears in every page footer. Local builds show
“Lokale versie”.

To roll back the Pages deployment, run **Deploy GitHub Pages** with a previous version tag. The workflow validates the
version and deploys that commit's `public/` directory. Run it without a version on `main`, or push `main`, to return to
the latest site.

## Recipe data

Reviewed recipe data is maintained in `public/recipes.json`; there is no active
recipe extractor. Do not edit recipe data casually: check source provenance,
validate quantities and portions, and ensure ingredients and methods are not
lost. Never invent unclear recipe content. Every change must pass
`scripts/validate_recipes.py`.

## Pull requests

Pull requests should include a summary, test evidence, screenshots for UI or
PDF changes, migration or provenance notes for recipe changes, and any license
or privacy impact. Use Conventional Commits such as `feat:`, `fix:`, `docs:`,
`test:`, and `chore:`.

When a code or configuration change affects behavior, architecture, deployment,
privacy, licensing, or contributor workflow, update all relevant documentation
in the same pull request: `AGENTS.md`, `README.md`, `docs/plan.md`,
`docs/architecture.md`, and the FOSS policy documents.
