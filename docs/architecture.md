# Architecture

Kitano meal planner is a static web application. Nginx serves the files in
`public/`; there is no application server, database, account system, analytics,
or server-side planning state.

## Data flow

1. The browser loads the reviewed `public/recipes.json` file served as a static asset.
2. The browser fetches that JSON and renders the weekly planner.
3. The browser stores the plan in versioned `localStorage`.
4. The browser aggregates compatible ingredients and creates the PDF with jsPDF.
5. The browser can fill empty meal slots randomly and can encode a plan in a
   shareable URL without sending planning data to a server.
6. The browser can filter one recipe by meal and generate a single-recipe PDF.

Recipe text is treated as data and inserted with text APIs, never as HTML.

Multi-day recipes use `multiDay: true` and a numeric `days` count. A recipe may
also contain `dailyVariants`; each variant has a zero-based `dayIndex`, its own
ingredients, and its own method. The shared recipe ingredients and all variant
ingredients are aggregated once for the shopping list, while the planner and
PDF identify the variant for each scheduled day.

## Build and deployment

The Docker build creates a small Nginx image. The container serves static assets
and does not receive planning data. GitHub Pages is the current public host; an
alternative self-hosted deployment should provide HTTPS, appropriate security
headers, access-log retention rules, and a health check for `/`.

GitHub Pages publishes the same `public/` directory through
`.github/workflows/deploy-pages.yml`. Relative asset paths make the application
work both at the local site root and at the project path `/kdt2o/`.

## Recipe data

`recipes/` contains the source material. The reviewed browser data is committed
as `public/recipes.json`; changes must be checked against the source material
before release.

## Browser boundaries

The only persistence mechanism is local browser storage. Clearing site data
removes the local plan. The static app has no endpoint that accepts or exports
planning data.
