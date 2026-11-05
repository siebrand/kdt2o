# Kitano meal planner

A static, containerized Dutch meal-planning application.

## Development

The application has no database and stores a plan only in the browser. Recipe sources are in `recipes/`. A plan can also be shared through a URL containing the plan data; no plan data is sent to a server.

Recipe data is maintained in the reviewed `public/recipes.json` file. Recipe source files are retained in `recipes/` for reference.

Build and run with Docker Desktop:

```bash
docker build -t kitano-meal-planner .
docker run --rm -p 8080:80 kitano-meal-planner
```

Open http://localhost:8080.

## GitHub Pages deployment

The live site is available at `https://siebrand.github.io/kdt2o/`. The GitHub Actions workflow deploys `public/` automatically after every push to `main`; GitHub Pages is configured to use that workflow.

## Language and commits

User-facing content is Dutch. Developer documentation and Git history are English. Use Conventional Commits, for example `feat: add weekly planner`.

## License and attribution

Source code is licensed under the MIT License. Recipe data and project documentation are dedicated to the public domain under CC0 1.0 where the applicable rights allow it. See [LICENSE](LICENSE), [LICENSE-CC0](LICENSE-CC0), and [ACKNOWLEDGEMENTS.md](ACKNOWLEDGEMENTS.md).

The application is published by Kitano ICT. See the [privacy policy](public/privacy.html) and [SECURITY.md](SECURITY.md).

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Community participation follows the [Code of Conduct](CODE_OF_CONDUCT.md).
