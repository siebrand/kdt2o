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

The hook validates `public/recipes.json` against `schemas/schema.json` and
additional rules in `scripts/validate_recipes.py` whenever recipe data, the
schema, or the validator changes. CI runs the same hooks on every push to
`main` and on every pull request.

## Workflow

1. Create a focused branch from `main`.
2. Keep changes small and explain the user-visible impact.
3. Keep all user-visible text, PDF text, and errors in Dutch.
4. Keep code, commits, branches, issues, pull requests, and developer documentation in English.
5. Run the relevant validation, such as the pre-commit hooks and the Docker build, and include the results in the pull request.
6. Open a pull request against `main`.

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
