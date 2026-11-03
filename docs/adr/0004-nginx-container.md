# ADR 0004: Serve the application with Nginx in a container

## Status

Accepted

## Decision

Package the static application in a small Nginx container.

## Consequences

Deployment is portable across hosts that run OCI containers. Runtime behavior
is intentionally limited to static file serving; production infrastructure is
responsible for TLS, headers, logs, and monitoring.
