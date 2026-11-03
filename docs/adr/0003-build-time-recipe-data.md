# ADR 0003: Generate recipe data at build time

## Status

Accepted

## Decision

Extract and validate recipe data during the build and serve the resulting JSON
as a versioned static asset.

## Consequences

The browser stays simple and deterministic. Recipe changes require a build and
review of generated output, while source hashes preserve provenance.
