# ADR 0001: Use a static client application

## Status

Accepted

## Decision

Serve the planner as static files and keep planning state in the browser.

## Consequences

This avoids accounts, a database, server-side personal data, and operational
state. It also means plans are local to a browser and are not synchronised
between devices.
