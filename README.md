# Kitano meal planner

A static, containerized Dutch meal-planning application.

## Development

The application has no database and stores a plan only in the browser. Recipe sources are in `recipes/`.

Generate recipe data:

```bash
python3 scripts/extract_recipes.py recipes public/recipes.json
```

Run parser tests:

```bash
python3 -m unittest discover -s tests
```

Build and run with Docker Desktop:

```bash
docker build -t kitano-meal-planner .
docker run --rm -p 8080:80 kitano-meal-planner
```

Open http://localhost:8080.

## Language and commits

User-facing content is Dutch. Developer documentation and Git history are English. Use Conventional Commits, for example `feat: add weekly planner`.

## License and attribution

Licensing, recipe provenance, branding permissions, acknowledgements, and security reporting must be completed before public deployment. See `docs/plan.md`.
