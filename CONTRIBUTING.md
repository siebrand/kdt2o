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
needed, and audit the workflows for security problems with zizmor. Pin every
action to a full commit SHA with the version in a comment, for example
`actions/checkout@<sha> # v7.0.1`; Dependabot keeps the pins up to date. CI
runs the same hooks on every push to `main` and on every pull request.

Browser smoke tests in `tests/test_browser.py` check loading at the site root
and under `/kdt2o/`, changelog rendering, planning, the shopping list, and the
PDF. They use Playwright for Python and run in CI. To run them locally with
[uv](https://docs.astral.sh/uv/):

```bash
uv run --no-project --with-requirements tests/requirements.txt python -m playwright install chromium
uv run --no-project --with-requirements tests/requirements.txt pytest tests
```

## Browser libraries

The site loads no code from other hosts. `package.json` and
`package-lock.json` lock the browser libraries, and `public/vendor/` serves
committed copies of them. To change a library version, or to complete a
Dependabot update for one:

```bash
npm ci --ignore-scripts
python3 scripts/vendor_dependencies.py
```

Commit the updated files in `public/vendor/` with the lockfile change. The CI
`vendored-dependencies` job runs `scripts/vendor_dependencies.py --check` and
fails while a copy does not match the locked version. Then run the browser
tests, which cover both PDF downloads.

## Security checks

`.github/workflows/security.yml` runs on every push to `main`, on pull
requests, and weekly:

- Dependency review blocks pull requests that add dependencies with known
  vulnerabilities of moderate severity or higher.
- `pip-audit` checks the Python test dependencies and the validator's
  `jsonschema` dependency.
- `npm audit` checks the browser libraries in `package-lock.json`.
- Grype scans the built Nginx image and fails on fixable vulnerabilities of
  high severity or higher. The results appear under code scanning.

The Content Security Policy allows scripts and styles from the site only, with
no `'unsafe-inline'`. Nginx sends it with every response. GitHub Pages cannot
send custom headers, so each page in `public/` also declares it in a `<meta>`
element directly after `<meta charset>`, without `frame-ancestors`. The
`check-page-security` pre-commit hook keeps these elements equal to
`nginx/security-headers.conf` and rejects external scripts, inline scripts and
styles, `style` attributes, and event handler attributes. The browser tests
fail on any CSP violation.

The CI `tests` job builds the container and runs
`scripts/check_security_headers.py` against it. The check fails when a path is
served without the security headers from `nginx/security-headers.conf`. Nginx
drops server-level `add_header` directives in a `location` block that sets its
own headers, so include the snippet in every such block.

`.github/workflows/codeql.yml` runs CodeQL with the `security-extended`
queries for JavaScript, Python, and the GitHub Actions workflows, on the same
triggers. The results appear under code scanning. The repository uses this
advanced CodeQL setup, so keep GitHub's CodeQL default setup disabled; with the
default setup enabled, GitHub rejects the results of this workflow.

`.github/workflows/links.yml` checks the links in the Markdown files and the
HTML pages with lychee, weekly and on pull requests that change them. Broken
external links do not block other pull requests. The settings, such as the
excluded local addresses, are in `lychee.toml`. To run the check locally:

```bash
docker run --rm -v "$PWD":/input -w /input lycheeverse/lychee:0.24.2 --no-progress './**/*.md' 'public/**/*.html'
```

The weekly runs catch vulnerabilities and broken links that appear after a
change was merged. Dependabot proposes updates for actions, the Docker base
image, the browser libraries, and the Python test dependencies.

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
