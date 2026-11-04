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

## Workflow

1. Create a focused branch from `main`.
2. Keep changes small and explain the user-visible impact.
3. Keep all user-visible text, PDF text, and errors in Dutch.
4. Keep code, commits, branches, issues, pull requests, and developer documentation in English.
5. Run the relevant validation, such as the Docker build, and include the results in the pull request.
6. Open a pull request against `main`.

## Recipe data

Reviewed recipe data is maintained in `public/recipes.json`; there is no active
recipe extractor. Do not edit recipe data casually: check source provenance,
validate quantities and portions, and ensure ingredients and methods are not
lost. Never invent unclear recipe content.

When a code or configuration change affects behavior, architecture, deployment,
privacy, licensing, or contributor workflow, update every relevant document in
the same change, including the README, plan, architecture notes, LLM context,
and FOSS policy documents.

## Pull requests

Pull requests should include a summary, test evidence, screenshots for UI or
PDF changes, migration or provenance notes for recipe changes, and any license
or privacy impact. Use Conventional Commits such as `feat:`, `fix:`, `docs:`,
`test:`, and `chore:`.

When a code or configuration change affects behavior, architecture, deployment,
privacy, licensing, or contributor workflow, update all relevant documentation
in the same pull request.
