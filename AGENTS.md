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
- `public/index.html`, `public/app.js`, `public/styles.css`: the browser
  application.
- `Dockerfile`, `nginx.conf`: the container. Nginx serves the static files.
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
2. Run `pre-commit run --all-files`. This step checks `public/recipes.json`.
3. If the change affects data or deployment, run
   `docker build -t kitano-meal-planner .`.

CI runs the same pre-commit checks. To see the application, run
`docker run --rm -p 8080:80 kitano-meal-planner`. Then open
`http://localhost:8080`.

## Changes

- Make small commits. Use Conventional Commits in English.
- Do not commit secrets, local state, or branding without a license.
- If a change affects behavior, architecture, deployment, privacy, licensing,
  or the contributor workflow, update all documents that describe it. Do this
  in the same change. These documents are `README.md`, `CONTRIBUTING.md`,
  `docs/plan.md`, `docs/architecture.md`, and the policy files.
