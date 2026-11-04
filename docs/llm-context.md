# LLM context

## Product

Kitano meal planner is a static Dutch web application for planning breakfast, lunch, and dinner from Monday through Sunday. It generates a PDF with a combined shopping list followed by one recipe per page.

## Source of truth

- Recipe sources: `recipes/`
- Reviewed recipe data: `public/recipes.json`
- Browser app: `public/index.html`, `public/app.js`, `public/styles.css`
- Container: `Dockerfile`, `nginx.conf`
- Agent rules: `AGENTS.md`

## Constraints

No database, accounts, tracking, analytics, or server-side plan storage. UI and generated output are Dutch. All development artifacts and Git history are English. Do not render recipe content as HTML.

## Validation

Use:

```bash
docker build -t kitano-meal-planner .
docker run --rm -p 8080:80 kitano-meal-planner
```

## Change discipline

Use a small atomic Conventional Commit. Whenever a code or configuration change
requires documentation changes, update all relevant documentation in the same
change. Check licensing before adding branding, fonts, icons, or recipe content.
