# Architecture

Kitano meal planner is a static web application. Nginx serves the files in
`public/`; there is no application server, database, account system, analytics,
or server-side planning state.

## Data flow

1. The browser loads the reviewed `public/recipes.json` file served as a static asset.
2. The browser fetches that JSON and renders the weekly planner.
3. The browser stores the plan in versioned `localStorage`.
4. The browser aggregates compatible ingredients and creates the PDF with jsPDF.
5. The browser can fill empty meal slots randomly and can encode a compact plan
   using stable codes derived from recipe IDs in a shareable URL without sending
   planning data to a server. Unknown recipe codes remain visible as unresolved
   recipe slots.
6. The browser can filter one recipe by meal and generate a single-recipe PDF.
7. Recipe lists and random selection use only recipes with `approved: true`.
8. Planned recipes can be moved by drag and drop within the same meal type. The
   dragged selection shifts by the distance between the dragged card and the
   drop cell, so multi-day recipes move as a whole and may be dropped on empty
   cells or on their own days. The recipe on the drop cell takes the dragged
   position (a swap); other recipes in the way move to the nearest free slots of
   the same meal. A move is rejected if a recipe does not fit in the week or
   there is no room.

Recipe text is treated as data and inserted with text APIs, never as HTML.

Multi-day recipes use `multiDay: true` and a numeric `days` count. A recipe may
also contain `dailyVariants`; each variant has a zero-based `dayIndex`, its own
ingredients, and its own method. Recipe ingredients, component ingredients marked
for shopping, and all variant ingredients are aggregated once for the shopping
list, while the planner and PDF identify the variant or component for each
scheduled day.

## Build and deployment

The Docker build creates a small Nginx image. The container serves static assets
and does not receive planning data. GitHub Pages is the current public host; an
alternative self-hosted deployment should provide HTTPS, appropriate security
headers, access-log retention rules, and a health check for `/`.

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

Shared subrecipes, such as `lijnzaadcrackers`, `granola`, and `notenbrood`,
are defined once in one recipe's `components`. When the browser loads the
data, it copies a shared subrecipe into every recipe whose main or daily-variant
ingredients reference it by `componentId`. Mentions in recipe text or in
alternatives do not attach a subrecipe.

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

The **Create release draft** workflow checks out a selected version tag, validates
it against the commit, builds the Nginx image, generates an SPDX SBOM for that
image with Syft, and creates a draft GitHub Release. The SBOM covers the
container contents; the browser-loaded jsPDF dependency remains external and is
pinned in `public/index.html`. Release notes are generated from the matching date
section of the single canonical `public/CHANGELOG.md`; there is no second
checked-in release-notes source. A maintainer reviews and publishes the draft.

GitHub Pages remains deployed from `main` on pushes. Its manual dispatch accepts
a version tag, validates it with the same version script, and deploys that
commit's `public/` directory for rollback. Dispatching without a version deploys
the selected branch commit. Both deployment workflows overwrite the source
`public/version.txt` local marker with the checked-out commit's CalVer before
publishing. All public pages display that ID in their footer. Pre-commit and CI
lint GitHub Actions workflows with actionlint from a pinned Docker image and
audit them with zizmor. Every action is pinned to a commit SHA. The security
workflow reviews dependency changes in pull requests, audits the Python
dependencies, and scans the built container image; it also runs weekly.
