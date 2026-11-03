# Agent guide

## Project purpose

Kitano meal planner is a static Dutch web application that lets a user select breakfast, lunch, and dinner recipes for Monday through Sunday and download a PDF with a combined shopping list and one recipe per page.

## Language rule

All user-visible text, errors, labels, PDF output, and UI content must be Dutch. Code, commit messages, branches, issues, pull requests, and developer documentation must be English.

## Architecture

- `recipes/` contains source PDF and text recipes.
- `scripts/extract_recipes.py` converts recipe sources into static `public/recipes.json` during the container build.
- `requirements.txt` is the single source for Python build dependencies and is managed by Dependabot.
- Each source file is hashed with SHA-256. Cached records with the same source hash and harmonizer version are reused.
- Optional LLM harmonization is enabled only when `RECIPE_LLM_COMMAND` is set; the command receives one recipe JSON object on stdin and must return a JSON object with the same `id`.
- `public/index.html`, `public/app.js`, and `public/styles.css` are the browser application.
- Nginx serves the static files. There is no database, account system, analytics, or server-side planning state.
- Browser `localStorage` is the only persistence mechanism.

## Domain invariants

- A recipe can be selected at most once.
- A recipe with more than two portions is treated as multi-day. Three-day recipes are placed on the chosen day and every other day.
- Empty meal slots are valid.
- Shopping-list quantities are combined only when unit and normalized ingredient name are compatible.
- Never render recipe text as HTML.

## Safe workflow

1. Read this file and `docs/plan.md` before changing architecture.
2. Run the documented checks before committing.
3. Keep commits small and use Conventional Commits in English.
4. Do not commit secrets, generated local state, or unlicensed branding.
5. Keep user-visible strings in the Dutch message catalog in `public/app.js`.

## Useful commands

- `python3 scripts/extract_recipes.py recipes public/recipes.json`
- `python3 -m unittest discover -s tests`
- `docker build -t kitano-meal-planner .`
- `docker run --rm -p 8080:80 kitano-meal-planner`
