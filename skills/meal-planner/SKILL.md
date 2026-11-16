---
name: meal-planner
description: Maintain the Kitano weekly meal-planning application, including recipe data maintenance, Dutch UI behavior, PDF generation, and container delivery.
---

# Meal planner skill

Read `AGENTS.md` and `docs/plan.md` before changing this project.

Keep the application static and database-free. Recipe data is maintained by hand in `public/recipes.json`; the original recipes are kept outside the repository, and changes are checked against them. Convert new recipes with the `recipe-text-to-json` skill. The browser stores only the user's weekly plan in `localStorage`.

Preserve these behaviors:

- one recipe selection per week;
- empty meal slots are valid;
- multi-day recipes occupy their `days` value of planned days, with one day between;
- shopping-list quantities are combined only when their unit and normalized name are compatible;
- user-visible text and PDF output remain Dutch;
- code, tests, commits, branches, and developer docs remain English.

Prefer small atomic changes. Run `pre-commit run --all-files`, which validates `public/recipes.json` against `schemas/schema.json`, and the container build before committing when the change affects data or deployment. Never add secrets, personal data, unlicensed assets, or generated local state.
