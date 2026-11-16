# ADR 0005: Edit recipe data manually and validate it with a schema

## Status

Accepted. Supersedes ADR 0003.

## Decision

Edit `public/recipes.json` manually. Compare each change with the original
recipe. The original recipes are not in the repository.

`schemas/schema.json` defines the rules for the recipe data.
`scripts/validate_recipes.py` checks the data against these rules. The script
also checks rules that a schema cannot express, such as unique IDs. A
pre-commit hook and the CI workflow run this script.

## Consequences

Incorrect recipe data cannot get into `main` without a failed check. The
script does not find content errors, such as an incorrect amount. A person must
compare each change with the original recipe.
