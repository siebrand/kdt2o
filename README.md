# Kitano meal planner

A static, containerized Dutch meal-planning application.

## Development

The application has no database and stores a plan only in the browser. Recipe sources are in `recipes/`.

Generate recipe data:

```bash
python3 scripts/extract_recipes.py recipes public/recipes.json
```

The extractor stores a SHA-256 source hash and reuses unchanged recipe records. Optional harmonization is enabled only with `RECIPE_LLM_COMMAND`; the command reads one recipe JSON object from stdin and returns the harmonized object as JSON. Without that environment variable, no LLM improvement is attempted.

Run parser tests:

```bash
python3 -m unittest discover -s tests
```

Build and run with Docker Desktop:

```bash
docker build -t kitano-meal-planner .
docker run --rm -p 8080:80 kitano-meal-planner
```

Open http://localhost:8080.

## GitHub Pages deployment

The repository includes a GitHub Actions workflow that deploys `public/` to GitHub Pages after every push to `main`. In the repository settings, set Pages → Build and deployment → Source to **GitHub Actions**. The project site is then available at `https://siebrand.github.io/kdt2o/`.

## Language and commits

User-facing content is Dutch. Developer documentation and Git history are English. Use Conventional Commits, for example `feat: add weekly planner`.

## License and attribution

Source code is licensed under the MIT License. Recipe data and project documentation are dedicated to the public domain under CC0 1.0 where the applicable rights allow it. See [LICENSE](LICENSE), [LICENSE-CC0](LICENSE-CC0), and [ACKNOWLEDGEMENTS.md](ACKNOWLEDGEMENTS.md).

The application is published by Kitano ICT. See the [privacy policy](public/privacy.html) and [SECURITY.md](SECURITY.md).

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Community participation follows the [Code of Conduct](CODE_OF_CONDUCT.md).
