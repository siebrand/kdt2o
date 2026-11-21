# Kitano meal planner

A static, containerized Dutch meal-planning application.

## Development

The application has no database and stores a plan only in the browser. A plan can also be shared through a URL
containing the plan data; no plan data is sent to a server.

Recipe data is maintained by hand in the reviewed `public/recipes.json` file. The original recipes are kept outside the
repository. Pre-commit validates the data against `schemas/schema.json` and checks GitHub Actions workflows with pinned
actionlint and zizmor; run `pre-commit install` once per clone. Browser smoke tests in `tests/` run in CI; see
[CONTRIBUTING.md](CONTRIBUTING.md) to run them locally. Only approved recipes are shown and selected.

Planned recipes can be moved by dragging them to another slot of the same meal type, or with the arrow buttons on each
card, which also work with the keyboard. An arrow button moves the card to the nearest earlier or later day where a drop
would succeed. Moving onto another recipe swaps the two; other recipes in the way are moved aside. The remove button on
a card removes the recipe from all its days and offers an undo. Click a planned recipe or a single-recipe result to view
its HTML recipe. The recipe dialog offers an optional cooking mode that requests a screen wake lock in supported
browsers while the recipe is visible. On narrower screens, the week switches to vertically stacked day sections with
breakfast, lunch, and dinner under each day, with a **Vandaag** button to jump to the current day.

Build and run with Docker Desktop:

```bash
docker build -t kitano-meal-planner .
docker run --rm -p 8080:80 kitano-meal-planner
```

Open http://localhost:8080.

## GitHub Pages deployment

The live site is available at `https://siebrand.github.io/kdt2o/`. The GitHub Actions workflow deploys `public/`
automatically after every push to `main`; `public/CHANGELOG.md` is served directly from that artifact. GitHub Pages is
configured to use that workflow.

## Commit versions, releases, and rollback

Each commit reachable from `main` receives an annotated tag in the deterministic CalVer form
`YYYY-MM-DD.NNNNNNNNNNNN-<full-commit-SHA>`. The date is the commit's ISO 8601 committer date; the zero-padded count
of commits reachable from it and the full SHA make versions
unique and lexically sortable by date, count, and SHA. This is CalVer, not SemVer. The version workflow backfills
history and tags new commits automatically.

To prepare a release, run **Create release draft** from GitHub Actions and enter a version tag. The workflow validates
the tag, builds the Docker image, generates an SPDX SBOM for that image, and creates a draft GitHub Release. The SBOM
covers the container contents, including the jsPDF copy in `public/vendor/`.
Release notes are generated from the matching date section of `public/CHANGELOG.md`, the canonical changelog. Review the
draft and publish it when ready. The deployed CalVer ID appears in every page footer; local builds show
`Lokale versie`.

To roll back GitHub Pages, run **Deploy GitHub Pages** from Actions and enter a previous version tag. The workflow
verifies the tag and deploys `public/` from that commit. Run it with an empty version on `main`, or push `main`, to
return to the current version.

## Language and commits

User-facing content is Dutch. Developer documentation and Git history are English. Use Conventional Commits, for example
`feat: add weekly planner`.

## License and attribution

Source code is licensed under the MIT License. Recipe data and project documentation are dedicated to the public domain
under CC0 1.0 where the applicable rights allow it. See [LICENSE](LICENSE), [LICENSE-CC0](LICENSE-CC0),
and [ACKNOWLEDGEMENTS.md](ACKNOWLEDGEMENTS.md).

The application is published by Kitano ICT. See the [privacy policy](public/privacy.html)
and [SECURITY.md](SECURITY.md).

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Community participation follows
the [Code of Conduct](CODE_OF_CONDUCT.md).
