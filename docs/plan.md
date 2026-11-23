# Plan: Kitano meal planner

## Not implemented

These are the remaining planned improvements. They are intentionally kept at the
top of this document.

- If the site moves from GitHub Pages to a self-hosted Nginx deployment, serve
  it with `nginx/security-headers.conf` and document the final deployment
  policy. GitHub Pages cannot send `frame-ancestors`, `X-Content-Type-Options`,
  or `Permissions-Policy`; the pages set only the CSP and the referrer policy.

## Current product status

The application is a static Dutch web application. The reviewed site is
published at `https://siebrand.github.io/kdt2o/` and is deployed automatically
from `main` by `.github/workflows/deploy-pages.yml`. Docker remains available
for local testing and alternative static hosting.

Recipe data is reviewed, maintained by hand, and committed in
`public/recipes.json`. The repository does not contain a recipe extractor; the
original recipes are kept outside the repository.

## Implemented features

The following features are complete and have been moved below the open work:

- [x] Seven-day breakfast, lunch, and dinner planner, displayed as stacked day sections with a **Vandaag** jump button
  on narrow screens.
- [x] One-click random filling of empty meal slots, including multi-day rules.
- [x] Drag-and-drop moving and swapping of planned recipes within the same meal
  type; multi-day recipes move as a whole and blocking recipes are moved aside.
- [x] Keyboard-accessible move buttons on each planned recipe, and a labeled
  remove button with undo instead of removal on any click. The buttons sit at
  the bottom of the card and accept the same moves as drag and drop: a button
  moves the card to the nearest earlier or later day where a drop succeeds.
- [x] Shareable menu links that restore a plan from the URL without server storage.
- [x] Single-recipe search by meal with a distinct PDF-download area and an HTML recipe view for the rest of the card.
- [x] Recipe details open as HTML when clicking a planned meal slot outside its buttons or drag-and-drop interaction.
- [x] Optional cooking mode keeps the screen awake while an HTML recipe is open, when supported by the browser; it
  releases the wake lock when disabled or the recipe closes.
- [x] Recipe selection at most once per week, with valid empty meal slots.
- [x] Multi-day planning with configurable `days` values and conflict checks.
- [x] Browser-only persistence through versioned `localStorage`.
- [x] Dutch UI, PDF labels, messages, and generated recipe content.
- [x] Structured ingredients, alternatives, unit normalization, and compatible
  shopping-list aggregation, with needed and optional quantities kept apart.
- [x] Shared flax-cracker subrecipes, including batch calculation and equipment.
- [x] Shared granola subrecipes, with one granola preparation per weekly list.
- [x] Shared subrecipes defined once in `public/recipes.json` and attached only
  to recipes whose ingredients reference them by `componentId`.
- [x] Recipe preparation-time fields shown on recipe cards and in PDFs.
- [x] JSON Schema for `public/recipes.json` in `schemas/schema.json`, enforced
  by a pre-commit hook running `scripts/validate_recipes.py`, locally and in CI.
- [x] Browser smoke tests with Playwright for loading at the site root and under
  `/kdt2o/`, planning, shopping-list aggregation, and PDF generation, run in CI.
- [x] Recipe approval markers.
- [x] Approved-only recipe visibility and random selection.
- [x] Recipe and shopping-list PDF generation in the browser with jsPDF.
- [x] An explicit "Afronden en boodschappenlijst bekijken" action that shows the
  shopping list in the application before the PDF download.
- [x] A weekly overview page in A4 landscape in the PDF, with links from each
  planned meal to its recipe page.
- [x] Recipe pages in the PDF grouped by day, with breakfast, lunch, and dinner
  in order.
- [x] Multi-day recipes show their planned days in the planner and the PDF.
- [x] Random recipe ordering in the recipe selection.
- [x] Equipment lists and advance notices, such as "de dag ervoor", on recipe
  pages and in the planner.
- [x] Privacy page, MIT/CC0 licensing, FOSS governance, contribution, conduct,
  and security documentation.
- [x] GitHub Pages deployment with relative asset paths for the `/kdt2o/`
  project site.
- [x] Deterministic CalVer version tags for every commit reachable from `main`,
  prefixed with the ISO commit date and disambiguated by commit count and SHA.
- [x] Display the deployed CalVer ID in every public page footer; deployment and
  release workflows stamp the checked-out commit version into the static site.
- [x] Automatically publish a GitHub Release for each newly pushed CalVer tag,
  with Dutch notes from the canonical changelog and an SPDX SBOM for the built Nginx image; existing tags are not
  backfilled.
- [x] Version-validated manual rollback of GitHub Pages to a tagged commit.
- [x] Actionlint validation of GitHub Actions workflows through pre-commit
  and CI.
- [x] Zizmor security audit of GitHub Actions workflows through pre-commit and
  CI, with every action pinned to a commit SHA and Dependabot cooldowns.
- [x] Security workflows: dependency review on pull requests, `pip-audit` for
  the Python dependencies, a Grype scan of the built Nginx image, CodeQL for
  JavaScript, Python, and workflows, and a weekly lychee link check.
- [x] Dependabot updates for actions, the Docker base image, the browser
  libraries, and the Python test dependencies.
- [x] jsPDF served from `public/vendor/`, locked in `package-lock.json`, and
  checked against the lockfile in CI; no page loads code from another host.
- [x] A strict Content Security Policy without `'unsafe-inline'`: sent by Nginx
  on every response and declared in a `<meta>` element on every page for
  GitHub Pages. Pre-commit, the container header check, and the browser tests
  enforce it.
- [x] Docker/Nginx container build for local and alternative hosting.
- [x] Footer links to the deployed changelog page and the publisher homepage at
  https://kitano.nl/.
- [x] Changelog page renders `public/CHANGELOG.md` directly without a second
  checked-in copy or a build-time copy step.

## Rejected or superseded initial plans

The following initial proposals were superseded by the implemented static
application and are retained here for historical context only:

- ~~React + TypeScript + Vite frontend~~ — superseded by the existing vanilla
  JavaScript static application.
- ~~`pdf-lib` PDF generation~~ — superseded by jsPDF already used by the app.
- ~~Build-time PDF/TXT extraction with `scripts/extract_recipes.py`~~ — removed;
  reviewed `public/recipes.json` is now the maintained browser data source.
- ~~OCR migration of the original recipe sources~~ — rejected; the originals
  are kept outside the repository and used for manual review.
- ~~Docker build-time recipe parsing and LLM harmonization~~ — rejected for the
  current static release; no extractor or `RECIPE_LLM_COMMAND` is active.
- ~~A database, account system, analytics, or server-side planning state~~ —
  rejected; the browser remains the only planning storage.
