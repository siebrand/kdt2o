# Architecture

Kitano meal planner is a static web application. Nginx serves the files in
`public/`; there is no application server, database, account system, analytics,
or server-side planning state.

## Data flow

1. Recipe sources are processed during the build into `public/recipes.json`.
2. The browser fetches that JSON and renders the weekly planner.
3. The browser stores the plan in versioned `localStorage`.
4. The browser aggregates compatible ingredients and creates the PDF with jsPDF.

Recipe text is treated as data and inserted with text APIs, never as HTML.

## Build and deployment

The Docker build creates a small Nginx image. The container serves static assets
and does not receive planning data. A host should provide HTTPS, appropriate
security headers, access-log retention rules, and a health check for `/`.

## Recipe data

`recipes/` contains the source material. The reviewed browser data is committed
as `public/recipes.json`; changes must be checked against the source material
before release.

## Browser boundaries

The only persistence mechanism is local browser storage. Clearing site data
removes the local plan. The static app has no endpoint that accepts or exports
planning data.
