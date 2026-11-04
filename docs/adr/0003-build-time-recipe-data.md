# ADR 0003: Generate recipe data at build time

## Status

Superseded

## Decision

The initial design extracted and validated recipe data during the build and
served the resulting JSON as a versioned static asset. This decision is retained
as historical context; the current application maintains reviewed recipe data
directly in `public/recipes.json` and has no active extractor.

## Consequences

The historical approach kept the browser simple and deterministic. It was
superseded because the published application now uses reviewed static data
directly; recipe changes are reviewed as changes to `public/recipes.json`.
