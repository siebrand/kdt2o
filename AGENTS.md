# Agent guide

## Project purpose

Kitano meal planner is a static Dutch web application that lets a user select breakfast, lunch, and dinner recipes for Monday through Sunday and download a PDF with a combined shopping list and one recipe per page.

## Language rule

All user-visible text, errors, labels, PDF output, and UI content must be Dutch. Code, commit messages, branches, issues, pull requests, and developer documentation must be English.

## Architecture

- `recipes/` contains source PDF and text recipes.
- Reviewed recipe data is maintained in `public/recipes.json`; source files remain in `recipes/` for reference.
- `public/index.html`, `public/app.js`, and `public/styles.css` are the browser application.
- Nginx serves the static files. There is no database, account system, analytics, or server-side planning state.
- Browser `localStorage` is the only persistence mechanism.

## Domain invariants

- A recipe can be selected at most once.
- Recipes marked `multiDay` use their `days` value when present. Multi-day recipes are placed on the chosen day and the applicable subsequent days.
- Empty meal slots are valid.
- Shopping-list quantities are combined only when unit and normalized ingredient name are compatible.
- Never render recipe text as HTML.

## Safe workflow

1. Read this file and `docs/plan.md` before changing architecture.
2. Run the documented checks before committing.
3. Keep commits small and use Conventional Commits in English.
4. Do not commit secrets, generated local state, or unlicensed branding.
5. Keep user-visible strings in the Dutch message catalog in `public/app.js`.
6. When a code or configuration change changes behavior, architecture,
   deployment, privacy, licensing, or contributor workflow, update every
   relevant document in the same change. Keep `README.md`, `docs/plan.md`,
   `docs/architecture.md`, `docs/llm-context.md`, and the FOSS policies
   consistent with the code.

## Useful commands

- `docker build -t kitano-meal-planner .`
- `docker run --rm -p 8080:80 kitano-meal-planner`
