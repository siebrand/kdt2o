# Agent guide

## Product

Kitano meal planner is a static web application in Dutch. The user selects
breakfast, lunch, and dinner recipes for Monday to Sunday. The application
makes a PDF file. The PDF file has a shopping list and one recipe on each page.

## Language

- Write all text that the user sees in Dutch. This includes the user
  interface, error messages, and the PDF.
- Write code, commit messages, branch names, issues, pull requests, and
  developer documents in English.
- Put Dutch user interface text in the message catalog in `public/app.js`.

## Files

- `public/recipes.json`: the recipe data. Edit this file manually.
- The original recipes are not in the repository. Compare each change to
  `public/recipes.json` with the original recipe.
- `schemas/schema.json`: the rules for the recipe data.
- `scripts/validate_recipes.py`: the script that checks the recipe data.
- `tests/test_browser.py`: the browser tests for the application.
- `public/index.html`, `public/app.js`, `public/styles.css`: the browser
  application.
- `public/version.txt`: local marker stamped with CalVer by deployment and
  release workflows.
- `package.json`, `package-lock.json`, `public/vendor/`: the browser
  libraries. Do not load code from other hosts. After a version change, run
  `npm ci --ignore-scripts` and `python3 scripts/vendor_dependencies.py`.
- `Dockerfile`, `nginx.conf`: the container. Nginx serves the static files.
- `nginx/security-headers.conf`: the security headers. Include this file in
  the server block and in each `location` block that sets headers.
- `scripts/release.py`: deterministic commit versions, tags, and release notes.
- `.github/workflows/`: CI, Pages deployment, commit version tags, and releases.
- `docs/plan.md`: open work and completed features. Read it before you change
  the architecture.

## Constraints

- Do not add a database, accounts, analytics, tracking, or server storage.
- Keep the weekly plan only in the browser `localStorage` or in a share link.
- Do not show recipe text as HTML.

## Domain rules

- The user can select each recipe only one time in a week.
- An empty meal slot is correct.
- A multi-day recipe uses its `days` value. The planner puts the recipe on the
  selected day and on each second day after it.
- The shopping list adds quantities only when the unit and the normalized
  ingredient name are the same.

## Checks

Do these steps before you commit:

1. Run `pre-commit install` one time for each clone.
2. Run `pre-commit run --all-files`. This step checks the recipe data. It
   also checks the GitHub Actions workflows with actionlint and zizmor. Pin
   each action in a workflow to a commit SHA, with the version in a comment.
3. If the change affects the application or the data, run the browser tests:
   `uv run --no-project --with-requirements tests/requirements.txt pytest tests`.
   Before the first run, install the browser with
   `uv run --no-project --with-requirements tests/requirements.txt python -m playwright install chromium`.
4. If the change affects data or deployment, run
   `docker build -t kitano-meal-planner .`.
5. For release tooling, run the full browser and release test suite with
   `uv run --no-project --with-requirements tests/requirements.txt pytest tests`.

CI runs the same pre-commit checks and browser tests. To see the application,
run `docker run --rm -p 8080:80 kitano-meal-planner`. Then open
`http://localhost:8080`.

## Changes

- Make small commits. Use Conventional Commits in English.
- Do not commit secrets, local state, or branding without a license.
- If a change affects behavior, architecture, deployment, privacy, licensing,
  or the contributor workflow, update all documents that describe it. Do this
  in the same change. These documents are `README.md`, `CONTRIBUTING.md`,
  `docs/plan.md`, `docs/architecture.md`, and the policy files.
