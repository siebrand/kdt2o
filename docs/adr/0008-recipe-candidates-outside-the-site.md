# ADR 0008: Keep recipe candidates outside the site

## Status

Accepted. Adds to ADR 0005.

## Decision

`data/candidates.json` has recipes that a script converted from a website and
that nobody reviewed yet. Commit this file once, in the format of
`public/recipes.json`, with `approved: false` on each recipe and with the open
points in `review`. The conversion script is not in the repository.

The Docker image and the Pages deployment publish only `public/`. Thus the
candidates are not on the site.

`scripts/validate_recipes.py` checks the candidates with the same rules as
`public/recipes.json`. The IDs and titles must be different from those in
`public/recipes.json`. The candidates are sorted by ID.

To accept a candidate, a person compares it with its `source`, solves the
`review` items, and moves it to `public/recipes.json`. ADR 0005 then applies to
it. A tool for this review can come later.

## Consequences

The download of the site does not grow with recipes that the planner does not
offer. The history of a candidate stays in Git. The candidates contain
estimates and conversion errors, and no person compared each of them with its
source.
