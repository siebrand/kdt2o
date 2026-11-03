---
name: meal-planner
description: Maintain the Kitano weekly meal-planning application, including recipe extraction, Dutch UI behavior, PDF generation, and container delivery.
---

# Meal planner skill

Read `AGENTS.md` and `docs/plan.md` before changing this project.

Keep the application static and database-free. Source recipes live in `recipes/`; the build converts them to `public/recipes.json`. The browser stores only the user's weekly plan in `localStorage`.

Preserve these behaviors:

- one recipe selection per week;
- empty meal slots are valid;
- breakfast and lunch recipes with enough portions can occupy three days with one day between;
- shopping-list quantities are combined only when their unit and normalized name are compatible;
- user-visible text and PDF output remain Dutch;
- code, tests, commits, branches, and developer docs remain English.

Prefer small atomic changes. Run the parser tests and the container build before committing when the change affects data or deployment. Never add secrets, personal data, unlicensed assets, or generated local state.
