# Architecture

Kitano meal planner is a static web application. Nginx serves the files in
`public/`; there is no application server, database, account system, analytics,
or server-side planning state.

## Data flow

1. The browser loads the reviewed `public/recipes.json` file served as a static asset.
2. The browser fetches that JSON and renders the weekly planner as a seven-column grid on wide screens and a vertical
   list of days on narrow screens, where a button scrolls to the current day.
3. The browser stores the plan in versioned `localStorage`.
4. The browser aggregates compatible ingredients and creates the PDF with jsPDF.
   Quantities are added only for the same normalized name and unit, and needed
   and optional quantities stay apart: when one recipe needs an ingredient and
   another lists it as optional, the needed total is in the main list and the
   optional extra is under "Optioneel", whatever the order of the recipes.
   The site serves jsPDF from `public/vendor/`, a committed copy of the npm
   package that `package.json` locks, so no page loads code from another host.
5. The browser can fill empty meal slots randomly and can encode a compact plan
   using stable codes derived from recipe IDs in a shareable URL without sending
   planning data to a server. Unknown recipe codes remain visible as unresolved
   recipe slots.
6. The browser can filter one recipe by meal, show recipe details as HTML, and generate a single-recipe PDF. A recipe
   with a `source` has a "Bron" link to that https URL in the recipe dialog and in both PDFs; the browser opens it only
   when the user clicks it. The recipe
   dialog can optionally request the Screen Wake Lock API while visible; it releases the lock when cooking mode is
   turned off or the dialog closes, and reacquires it when the page becomes visible again.
7. Recipe lists and random selection use only recipes with `approved: true`.
   A recipe lists in `categories` the meals it fits, for example `["lunch",
   "diner"]`; the planner offers it, and random filling uses it, for each of
   these meals.
8. Planned recipes can be moved by drag and drop within the same meal type. The
   dragged selection shifts by the distance between the dragged card and the
   drop cell, so multi-day recipes move as a whole and may be dropped on empty
   cells or on their own days. The recipe on the drop cell takes the dragged
   position (a swap); other recipes in the way move to the nearest free slots of
   the same meal. A move is rejected if a recipe does not fit in the week or
   there is no room. Each planned card also has buttons at its bottom that move
   the card to the nearest earlier or later day where a drop of the card
   succeeds. Both paths use `planSelectionMove()`, so the buttons accept exactly
   the moves that drag and drop accepts, and moving works without a pointer.
   Removal needs the card's remove button; it removes all days of the recipe and
   shows an undo notice that stays while it has focus or the pointer.

Recipe text is treated as data and inserted with text APIs, never as HTML.

Multi-day recipes use `multiDay: true` and a numeric `days` count. A recipe may
also contain `dailyVariants`; each variant has a zero-based `dayIndex`, its own
ingredients, and its own method. Recipe ingredients, component ingredients marked
for shopping, and all variant ingredients are aggregated once for the shopping
list, while the planner and PDF identify the variant or component for each
scheduled day.

## Browser modules

The application is a set of ES modules in `public/`, without a build step.
`app.js` renders the pages and handles the events; the other modules do not
touch the page, except through `state.js`:

- `state.js`: the page state that the modules share, the recipes and the plan.
- `plan.js`: days, meals, plan keys, `localStorage`, and the share-link codes.
- `planning.js`: the move rules that drag and drop and the move buttons share.
- `recipes.js`: recipe availability, preparation times, shared subrecipes, and
  recipe labels.
- `shopping.js`: ingredient normalization, weekly totals, and categories.
- `pdf.js`: the weekly PDF and the single-recipe PDF.
- `messages.js`: all Dutch text that the user sees.

## Build and deployment

The Docker build creates a small Nginx image. The container serves static assets
and does not receive planning data. GitHub Pages is the current public host; an
alternative self-hosted deployment should provide HTTPS, the headers from
`nginx/security-headers.conf`, access-log retention rules, and a health check
for `/`.

The Content Security Policy allows scripts and styles from the site only. Nginx
sends it with the other security headers on every response. GitHub Pages
cannot send custom headers, so every page also declares the CSP, without
`frame-ancestors`, and the referrer policy in `<meta>` elements.

Nginx compresses the HTML, JavaScript, CSS, and JSON with gzip. It serves the
pages, scripts, styles, and `recipes.json` with `Cache-Control: no-cache`, so
browsers revalidate them with their ETag on every visit and download a file
again only after a change; images may be cached for a day. GitHub Pages lets
browsers cache every file for some minutes and cannot be configured, so the
Pages deployment runs `scripts/stamp_assets.py`, which adds `?v=<CalVer>` to
every local script and stylesheet URL and to every relative module import. A
new deployment therefore never runs with cached scripts of the previous one,
and every import of a module has the same URL, so the browser loads each module
once. The files in the repository carry no version query, and the application
fetches `recipes.json` with revalidation.

GitHub Pages and the Docker image serve the static files in `public/` directly.
The canonical changelog is `public/CHANGELOG.md`; `public/changelog.html` renders
that same-origin file. No second changelog source or build-time copy is needed.
Relative asset paths make the application work both at the local site root and
at the project path `/kdt2o/`.

## Recipe data

The reviewed browser data is maintained by hand and committed as
`public/recipes.json`. The original recipes are kept outside the repository;
changes must be checked against them before release. `schemas/schema.json`
defines the data contract. A pre-commit hook runs `scripts/validate_recipes.py`,
which applies the schema plus rules a schema cannot express, such as unique IDs
and resolvable component references. The CI workflow runs the same hook, so
invalid data cannot reach `main` unnoticed.

The recipes are for people with type 2 diabetes. Ingredients can carry `flags`
(`sweetener`, `honey`, `sugar`, `alcohol`, `fruit-juice`, `starch`,
`dried-fruit`, `brand-product`), and a recipe can carry `review` items, open
points with a type and a note, and a `source` with the name and URL of the site
it comes from. The validator refuses `approved: true` while a recipe has open
review items or an ingredient flagged `sweetener`, `honey`, or `sugar`, so a
recipe with such a problem cannot reach the planner by accident. A recipe can
have `nutrition` values per portion; the application does not display them yet.

`data/candidates.json` holds converted recipes that nobody reviewed yet, in the
same format and with `approved: false`. It is outside `public/`, so neither the
container nor GitHub Pages serves it and the browser never loads it. The
validator checks it together with the recipe data, rejects an approved
candidate, and requires new IDs and titles. A reviewed candidate moves to
`public/recipes.json`.

Shared subrecipes, such as `lijnzaadcrackers`, `granola`, and `notenbrood`,
are defined once in one recipe's `components`. When the browser loads the
data, it copies a shared subrecipe into every recipe whose main or daily-variant
ingredients reference it by `componentId`. Mentions in recipe text or in
alternatives do not attach a subrecipe.

The shopping list adds a shared subrecipe once per week, however many planned
recipes reference it. When the referencing ingredients use the subrecipe's
`yieldUnit` (an empty unit counts as "stuk"), it adds enough batches for their
total, as for `lijnzaadcrackers`; otherwise it adds one batch, as for `granola`
and `notenbrood`. No subrecipe ID is named in the code.

## Browser boundaries

The only persistence mechanism is local browser storage. Clearing site data
removes the local plan. The static app has no endpoint that accepts or exports
planning data.

## Versioning and releases

`scripts/release.py` derives a deterministic CalVer tag for any commit from its
ISO committer date, zero-padded count of reachable commits, and full SHA. This
produces unique, lexically sortable version tags without a mutable version file.
The **Version commits** workflow tags every commit reachable from `main`,
including untagged history, and tags new commits automatically.

The **Publish release** workflow runs for each newly pushed CalVer tag. It
validates the tag, builds the Nginx image, generates an SPDX SBOM for that image
with Syft, and publishes a GitHub Release with the SBOM asset. Release notes are
generated from the matching date section of the single canonical
`public/CHANGELOG.md`; there is no second checked-in release-notes source.
Existing tags are not backfilled. The version-tag workflow pushes tags with
`WORKFLOW_PAT` so these pushes trigger the release workflow.

GitHub Pages remains deployed from `main` on pushes. Its manual dispatch accepts
a version tag, validates it with the same version script, and deploys that
commit's `public/` directory for rollback. Dispatching without a version deploys
the selected branch commit. Both deployment workflows overwrite the source
`public/version.txt` local marker with the checked-out commit's CalVer before
publishing. All public pages display that ID in their footer. Pre-commit and CI
lint GitHub Actions workflows with actionlint from a pinned Docker image and
audit them with zizmor. Every action is pinned to a commit SHA. The security
workflow reviews dependency changes in pull requests, audits the Python
dependencies, and scans the built container image; it also runs weekly. CodeQL
analyzes the JavaScript, the Python scripts, and the workflows. A weekly link
check with lychee covers the documentation and the public HTML pages.

## Decisions

The reasons for the main choices are in the architecture decision records in
`docs/adr/`: the static client application (0001), PDF generation in the
browser (0002), the Nginx container (0004), manually edited and validated
recipe data (0005, which supersedes 0003), and CalVer versions with automatic
releases (0007, which supersedes 0006). Add a record for a new architecture
decision, and mark a replaced record as superseded instead of editing it.
