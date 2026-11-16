# Changelog

All notable changes to this project are documented here.

## 2026-11-16

- Aligned `schemas/schema.json` with the recipe data and added a pre-commit hook, also run in CI, that validates `public/recipes.json`.
- Reviewed and corrected recipe data: shopping units, ingredient names, amounts, portions, diet labels, and timings.

## 2026-11-04

- Published the static site through GitHub Pages with automatic deployment from `main`.
- Added optional infographic pages to the planning PDF.
- Added shared subrecipes, preparation times, recipe approval filtering, and reviewed recipe data updates.
- Removed obsolete extractor tests, CI steps, PDF/OCR tooling, and Python dependency automation after the extractor was retired.

## 2026-11-03

- Added recipe subrecipe support and shared flax-cracker batch handling.
- Added browser-generated shopping-list and recipe PDF improvements.
