# Plan: Kitano meal planner

## Not implemented

These are the remaining planned improvements. They are intentionally kept at the
top of this document.

- Add browser-level smoke tests for planning, shopping-list aggregation, PDF
  generation, and the GitHub Pages base path.
- Add a JSON Schema or equivalent runtime validation for `public/recipes.json`.
- Add dedicated security and dependency workflows for action, dependency,
  Docker-image, and link scanning.
- Add a release process with versioned release notes, an SBOM, and a tested
  rollback procedure.
- Add production security headers and document the final deployment policy if
  the site moves from GitHub Pages to a self-hosted Nginx deployment.

## Current product status

The application is a static Dutch web application. The reviewed site is
published at `https://siebrand.github.io/kdt2o/` and is deployed automatically
from `main` by `.github/workflows/deploy-pages.yml`. Docker remains available
for local testing and alternative static hosting.

Recipe data is reviewed and committed in `public/recipes.json`. The repository
does not contain an active recipe extractor; `recipes/` is retained as source
reference material.

## Implemented features

The following features are complete and have been moved below the open work:

- [x] Seven-day breakfast, lunch, and dinner planner.
- [x] One-click random filling of empty meal slots, including multi-day rules.
- [x] Drag-and-drop moving and swapping of planned recipes within the same meal
  type; multi-day recipes move as a whole and blocking recipes are moved aside.
- [x] Shareable menu links that restore a plan from the URL without server storage.
- [x] Single-recipe search by meal with direct PDF generation.
- [x] Recipe selection at most once per week, with valid empty meal slots.
- [x] Multi-day planning with configurable `days` values and conflict checks.
- [x] Browser-only persistence through versioned `localStorage`.
- [x] Dutch UI, PDF labels, messages, and generated recipe content.
- [x] Structured ingredients, alternatives, unit normalization, and compatible
  shopping-list aggregation.
- [x] Shared flax-cracker subrecipes, including batch calculation and equipment.
- [x] Shared granola subrecipes, with one granola preparation per weekly list.
- [x] Recipe preparation-time fields shown on recipe cards and in PDFs.
- [x] Recipe approval markers and exclusion of approved recipes from the review
  PDF at `all-recipes.html`.
- [x] Approved-only recipe visibility and random selection by default, with an
  explicit option to include all recipes.
- [x] Recipe and shopping-list PDF generation in the browser with jsPDF.
- [x] Privacy page, MIT/CC0 licensing, FOSS governance, contribution, conduct,
  and security documentation.
- [x] GitHub Pages deployment with relative asset paths for the `/kdt2o/`
  project site.
- [x] Docker/Nginx container build for local and alternative hosting.

## Rejected or superseded initial plans

The following initial proposals were superseded by the implemented static
application and are retained here for historical context only:

- ~~React + TypeScript + Vite frontend~~ — superseded by the existing vanilla
  JavaScript static application.
- ~~`pdf-lib` PDF generation~~ — superseded by jsPDF already used by the app.
- ~~Build-time PDF/TXT extraction with `scripts/extract_recipes.py`~~ — removed;
  reviewed `public/recipes.json` is now the maintained browser data source.
- ~~OCR migration and deletion of the original recipe sources~~ — rejected;
  source reference material remains in the repository.
- ~~Docker build-time recipe parsing and LLM harmonization~~ — rejected for the
  current static release; no extractor or `RECIPE_LLM_COMMAND` is active.
- ~~A database, account system, analytics, or server-side planning state~~ —
  rejected; the browser remains the only planning storage.
