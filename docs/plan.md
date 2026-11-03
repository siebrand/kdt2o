# Plan: wekelijkse maaltijdplanner

## Current status (2026-11-03)

- The repository is on `main` and is up to date with `origin/main`.
- The initial extraction completed with 70 recipe records, but it is not content-complete: 69 records have no structured ingredients and 68 have no preparation method. The cause is that most source PDFs are image-only PDFs and the current `pypdf` extraction does not perform OCR.
- The five existing unit tests pass (`python3 -m unittest discover -s tests`). These tests cover application behavior, not recipe-content completeness.
- OCR tooling is available locally: Tesseract 5.5.4 with Dutch language data, OCRmyPDF 17.13.0, and Poppler 26.10.0.
- One OCR sample (`aardbeienkwark`) produced usable Dutch text, with minor OCR noise such as a stray character and branding text.
- A complete OCR staging tree has not yet been completed. `recipes-ocr/` contains a single test output; `recipes-ocr-full/` is expected to be created as a temporary working tree.
- The working tree contains uncommitted extraction, migration, schema, audit, generated JSON, and OCR-related files. No source recipes have been deleted.

## Revised recipe-data plan

The recipe sources will be processed in this order:

1. Create OCR text from every PDF into a temporary staging tree, while leaving the original `recipes/` sources untouched. Copy the existing text recipe files into the same staging tree.
2. Read the OCR text and text sources as the authoritative content input for the migration. Use model-assisted harmonization to populate every canonical recipe record, including title, category, servings, multi-day behavior, ingredients, quantities, units, optional alternatives, and preparation steps.
3. Preserve provenance in every record: the original source path, original source format, and SHA-256 hash of the original source file. OCR derivatives are working artifacts, not replacement provenance.
4. Review every record for OCR noise, missing fields, implausible servings, duplicate IDs, ingredient parsing errors, and unsafe assumptions. Keep qualitative quantities and alternatives visible when they cannot be safely normalized.
5. Generate a machine-readable audit report listing every recipe, its source, validation result, and any unresolved ambiguity. No recipe is considered complete merely because the JSON is syntactically valid.
6. Resolve all ambiguities against the OCR text and original source. If a source remains genuinely unclear, stop and ask for a decision rather than inventing content.
7. Run the unit tests, canonical-schema validation, source-hash checks, recipe-count checks, and a final source-versus-JSON review. Confirm that the application consumes the canonical schema and that no recipe has empty ingredients or steps without an explicit source-based reason.
8. Only after the complete audit passes, present the final deletion scope. Delete the original recipe sources and temporary OCR derivatives as a separate, reviewable operation; retain the source hashes and audit report in the generated data/documentation.

The parser remains a fallback and structural validation tool. It is not the authority for recipe wording or ingredient interpretation. The model-assisted migration is the authority, constrained by the OCR/text source and the audit checks above.

## Doel

Een Nederlandstalige webapplicatie waarin een gebruiker van maandag tot en met zondag recepten kan kiezen voor ontbijt, lunch en diner. Niet iedere maaltijd hoeft ingevuld te worden. De gekozen planning wordt in de browser bewaard en kan als PDF worden gedownload met een gecombineerde boodschappenlijst en daarna één recept per pagina.

## Vastgelegde uitgangspunten

- Een recept mag maximaal één keer in de weekplanning worden gekozen.
- Recepten zijn normaal gesproken voor twee personen.
- Een recept met voldoende porties voor meerdere dagen wordt herkend aan het aantal porties. Als werkregel wordt `aantal dagen = ceil(porties / 2)` gebruikt; voor de bedoelde meerdaagse ontbijt- en lunchrecepten betekent dit drie gebruiksmomenten.
- De gebruiker kiest de startdag van een meerdaags recept. De overige gebruiksmomenten worden om de dag gepland: startdag, startdag + 2 dagen en startdag + 4 dagen. De planner voorkomt dat de reeks buiten maandag–zondag valt en geeft een duidelijke melding als er geen geldige startdag beschikbaar is.
- Ingrediënten worden in de PDF samengevoegd per gestandaardiseerde ingrediëntnaam en hoeveelheid opgeteld.
- De toepassing gebruikt geen database. Browseropslag is toegestaan.
- De applicatie en PDF zijn volledig in het Nederlands.
- De uiteindelijke toepassing moet in een container kunnen draaien en geschikt zijn voor publicatie op internet.

## Voorgestelde technologie

- **Frontend:** React + TypeScript + Vite.
- **Styling:** gewone CSS met CSS-variabelen, responsive grid voor de weekplanning en een rustige, toegankelijke visuele stijl.
- **PDF in de browser:** `pdf-lib`, zodat de gebruiker direct vanuit de browser een PDF kan downloaden zonder server-side sessie of database.
- **Receptdata:** statische, tijdens de image-build gegenereerde JSON. De bronbestanden in `recipes/` blijven leidend.
- **Extractie:** een klein Python-buildscript met `pypdf` voor PDF-recepten en UTF-8-inlezing voor `.txt`-recepten. Het script normaliseert titels, categorieën, porties, ingrediënten en bereidingsstappen.
- **Container:** multi-stage Docker-build: Node bouwt de frontend; een kleine Nginx-image serveert de statische bestanden.
- **Deployment:** iedere host die een Docker-container of OCI-image kan draaien is geschikt; er is geen server-side applicatietoestand nodig.

## Receptverwerking

1. Scan `recipes/01-ontbijt`, `recipes/02-lunch` en `recipes/03-diner`.
2. Bepaal de categorie op basis van de mapnaam.
3. Haal uit elk bestand de titel, porties, ingrediënten en bereidingswijze.
4. Ondersteun zowel tekst-PDF’s als bestaande tekstbestanden. Onduidelijke velden worden als validatiefout gerapporteerd tijdens de build, niet pas in de browser.
5. Normaliseer ingrediënten voor samenvoeging, bijvoorbeeld hoofdletters, spaties, breuken en eenheden. Varianten zoals “feta (of geitenkaas)” blijven zichtbaar als keuze en worden niet onterecht met elkaar opgeteld.
6. Markeer recepten met meer dan twee porties als mogelijk meerdaags. De UI toont de afgeleide duur en vraagt bij selectie om een startdag wanneer dat nodig is.
7. Bewaar zowel de originele ingrediëntenregel als de gestructureerde hoeveelheid/eenheid/naam, zodat de PDF leesbaar blijft wanneer een regel niet veilig te parseren is.

De huidige bronset bevat naast PDF’s ook samengestelde tekstbestanden en portie-aanduidingen per recept. Daarom is een controlepagina of buildrapport nodig met recepten waarvan porties of ingrediënten niet betrouwbaar konden worden gelezen.

## Gebruikersinterface

- Kop met Voeding Leeft-branding en titel van de planner.
- Weekweergave met zeven dagen en drie rijen: ontbijt, lunch en diner.
- Per lege cel een receptkiezer met filter op categorie en zoekveld.
- Geselecteerde recepten tonen titel, porties, berekende dagen en eventuele vervolgdag(en).
- Recepten die al in een andere cel zijn gekozen worden niet opnieuw aangeboden.
- Bij een meerdaags recept kiest de gebruiker de startdag; de automatisch geplande dagen zijn zichtbaar en kunnen niet conflicteren met andere geselecteerde recepten.
- Knoppen voor “Planning wissen”, “Planning bewaren” en “PDF downloaden”.
- Browseropslag via `localStorage`, inclusief versieveld voor toekomstige wijzigingen in de datastructuur.
- Toegankelijkheid: labels voor alle controles, toetsenbordbediening, voldoende contrast, focus-indicatoren en begrijpelijke foutmeldingen.

## PDF-opbouw

De knop “PDF downloaden” maakt één document in deze volgorde:

1. Voorblad met weekplanning, datum van genereren en branding.
2. Boodschappenlijst met gecombineerde ingrediënten, gegroepeerd in logische rubrieken voor zover die betrouwbaar uit de bron af te leiden zijn. Elke regel bevat de totale hoeveelheid en de verwijzingen naar de geplande maaltijd(en).
3. De gekozen recepten in chronologische volgorde van bereidingsmoment. Bij meerdaagse recepten wordt duidelijk vermeld op welke dagen het recept wordt gemaakt of gegeten.
4. Elk recept start op een nieuwe pagina en bevat titel, categorie, dagen, porties, ingrediënten en bereidingswijze.

De PDF moet ook werken bij een gedeeltelijk ingevulde week. Als geen recept is geselecteerd, blijft de downloadknop uitgeschakeld en krijgt de gebruiker een Nederlandstalige uitleg.

## Branding en ontbrekende input

In de huidige repository is geen afzonderlijke PDF met Voeding Leeft-logo’s aangetroffen. Voor implementatie is daarom nodig:

- de PDF met de logo’s, of geëxporteerde logo-assets met toestemming voor gebruik;
- bij voorkeur een lichte en donkere variant en de gewenste minimale witruimte;
- bevestiging dat de aangeleverde logo’s in de publieke webapp en gegenereerde PDF mogen worden opgenomen.

Na ontvangst worden de logo’s tijdens de build naar geschikte PNG/SVG-assets geëxporteerd en zowel in de webkop als in de PDF-template gebruikt. Als de PDF uitsluitend vectorlogo’s bevat, heeft SVG de voorkeur voor scherpe weergave.

## Projectstructuur

```text
.
├── recipes/                 # bronrecepten, ongewijzigd
├── scripts/
│   ├── extract-recipes.py   # PDF/TXT naar gevalideerde JSON
│   └── validate-recipes.py  # buildrapport en fouten
├── public/
│   └── branding/            # aangeleverde Voeding Leeft-assets
├── src/
│   ├── data/recipes.json    # gegenereerd, niet handmatig onderhouden
│   ├── components/
│   ├── lib/
│   │   ├── planning.ts
│   │   ├── ingredients.ts
│   │   └── pdf.ts
│   └── App.tsx
├── docs/plan.md
├── Dockerfile
└── nginx.conf
```

## Test- en validatieplan

- Unit-tests voor portie-naar-dagen, om-de-dag-planning, weekgrenzen en dubbele receptselectie.
- Unit-tests voor ingrediënten-normalisatie en optelling van gram, milliliter, eetlepels en stuks.
- Tests voor gedeeltelijke planningen en een volledig lege planning.
- PDF-smoketest met één recept, meerdere recepten en een meerdaags recept; controleer paginabreaks en Nederlandse tekstdelen.
- Recept-build uitvoeren op alle huidige bestanden en een rapport maken van ontbrekende porties, OCR/tekstextractie-problemen en niet-herkende ingrediënten.
- Browsercontrole op mobiel en desktop, inclusief toetsenbord en schermlezerlabels.
- Docker-build en containerstart testen; controleer dat de statische app onder een configureerbare publieke basis-URL werkt.

## Implementatievolgorde

1. Receptextractie, normalisatie en validatierapport.
2. Branding-assets toevoegen zodra de Voeding Leeft-PDF beschikbaar is.
3. Datamodel en weekplanner met conflictcontrole.
4. Nederlandstalige responsive interface en browseropslag.
5. Ingrediëntensamenvoeging en PDF-generator.
6. Tests, Docker/Nginx-configuratie en productie-build.
7. Deploymentdocumentatie met omgevingsvariabelen, healthcheck en voorbeeldcommando’s.

## Belangrijke risico’s en beslissingen

- PDF’s kunnen verschillende interne tekststructuren hebben; daarom moet extractie worden gevalideerd en mag de browser niet afhankelijk zijn van live PDF-parsing.
- Porties worden niet altijd consistent geschreven. Het buildrapport moet uitzonderingen zichtbaar maken voordat de recepten publiek worden gebruikt.
- Eenheden zonder numerieke hoeveelheid, zoals “ruim belegd” of “scheut”, kunnen niet wiskundig worden opgeteld. Deze blijven als afzonderlijke kwalitatieve regels in de boodschappenlijst staan.
- De voorgestelde regel voor drie dagen is gebaseerd op porties voor twee personen. Als de bronrecepten een andere semantiek gebruiken voor porties, moet die regel in de parserconfiguratie aanpasbaar zijn.

## Receptextractie, harmonisatie en caching

Tijdens iedere build worden PDF- en tekstbronnen uit `recipes/` geëxtraheerd naar `public/recipes.json`. Iedere bron krijgt een SHA-256-hash. Als de hash en de harmonizer-versie gelijk zijn aan de vorige gegenereerde output, wordt het bestaande geharmoniseerde record hergebruikt.

Harmonisatie is optioneel en mag alleen worden uitgevoerd wanneer een LLM-adapter beschikbaar is. De build ondersteunt daarom `RECIPE_LLM_COMMAND`: het commando ontvangt één recept als JSON op stdin en retourneert een gevalideerd JSON-object met dezelfde `id`. Zonder deze variabele blijft de parseroutput onveranderd, afgezien van structurele normalisatie. Fouten of ongeldige LLM-uitvoer blokkeren de build niet en vallen terug op de geëxtraheerde brondata; dit wordt naar stderr gemeld.

De Docker-build kopieert bestaande gegenereerde data naar de buildstage voordat de extractor draait. Daardoor blijft de hash-cache beschikbaar bij lokale incrementele builds. CI- en productie-builds moeten de gegenereerde output als cache kunnen doorgeven als hergebruik van harmonisatie gewenst is.

De receptkiezer toont uitsluitend de receptnaam en de actie om die naam toe te voegen. Porties, categorieën, ingrediënten en bereidingswijze zijn niet zichtbaar in de keuzelijst; deze informatie blijft beschikbaar voor planning en PDF-generatie.

## FLOSS-documentatie en projectgovernance

De ontwikkelaarsdocumentatie wordt in het Engels geschreven; alleen de gebruikersinterface, foutmeldingen, gegenereerde PDF en andere eindgebruikersuitvoer zijn Nederlands. Voeg naast `docs/plan.md` de volgende bestanden toe:

- `README.md`: doel, screenshots, lokale ontwikkeling, Docker-start, configuratie, deployment en link naar de live demo.
- `CONTRIBUTING.md`: development setup, testcommando’s, branch/PR-proces, reviewcriteria, commitconventie en hoe receptdata wordt gevalideerd.
- `CODE_OF_CONDUCT.md`: Contributor Covenant of een gelijkwaardige FLOSS-gedragscode.
- `SECURITY.md`: ondersteunde versies, responsible disclosure, contactkanaal en wat niet in publieke issues mag worden gemeld.
- `LICENSE`: een expliciete FLOSS-licentie, te kiezen vóór publicatie na controle van de rechten op recepten, logo’s en eventuele fonts.
- `NOTICE` of `ACKNOWLEDGEMENTS.md`: Voeding Leeft, receptauteurs, gebruikte libraries, fonts, iconen en eventuele bronprojecten met licentie en URL.
- `docs/architecture.md`: dataflow, build-time receptextractie, PDF-generatie, opslaggrenzen en deploymentarchitectuur.
- `docs/adr/`: korte Architecture Decision Records voor onder andere geen database, client-side PDF, receptparser en containerdeployment.
- `docs/llm-context.md`: compacte context voor LLM-agents met projectdoel, invarianten, mapstructuur, commands, veiligheidsregels en bekende valkuilen.
- `AGENTS.md` en/of `CLAUDE.md` indien nodig voor agent-specifieke instructies; deze mogen elkaar niet tegenspreken en verwijzen naar dezelfde bronregels.
- `CHANGELOG.md`: gebruikersgerichte wijzigingen per versie; de changelogtekst is Engels tenzij het onderdeel eindgebruikersuitvoer betreft.

LLM-documentatie moet geen geheimen, tokens, persoonsgegevens of volledige receptinhoud dupliceren. Houd instructies kort, controleerbaar en versieerbaar. Benoem expliciet welke bestanden gegenereerd zijn, welke commando’s veilig zijn en welke acties menselijke goedkeuring vereisen. Voeg een template toe voor bug reports en feature requests met reproduceerstappen, verwachte uitkomst en privacy-informatie.

## GitHub Actions en kwaliteitspoorten

Plan minimaal deze workflows onder `.github/workflows/`:

- `ci.yml`: checkout met vaste action-versies, Node- en Pythonversies vastgelegd, dependency-installatie met lockfile, lint, typecheck, unit-tests, receptextractie/validatie, productie-build en Docker-build.
- `security.yml`: dependency audit, secret scanning waar beschikbaar, CodeQL voor TypeScript/Python en controle op kwetsbare Docker-baselayers.
- `dependency-review.yml`: op pull requests een dependency review met blokkade op kritieke kwetsbaarheden of verboden licenties.
- `release.yml`: alleen op een beschermde tag; bouwt een reproduceerbare image, publiceert SBOM en image naar de gekozen registry en maakt release-artifacts.
- `link-check.yml`: controleert documentatielinks en eventueel de live deployment.

Gebruik least-privilege `permissions`, pin third-party actions bij voorkeur op commit-SHA, beperk concurrency, gebruik geen secrets in pull requests van forks en publiceer alleen na expliciete release-trigger. Upload test- en buildartefacts met beperkte retentie. De CI moet falen bij lint-, type-, test-, parser- of securityproblemen; waarschuwingen worden niet stilzwijgend genegeerd.

## Onderhoudbaarheid

- TypeScript strict mode, kleine pure functies voor planning en ingrediënten, duidelijke domeintypen en geen verborgen globale toestand.
- Lockfiles verplicht; dependency-updates via Dependabot of Renovate met wekelijkse pull requests en CI-verificatie.
- Eén bron van waarheid voor Nederlandse UI-teksten en PDF-labels; voorkom verspreide hardcoded vertalingen.
- Gegenereerde receptdata krijgt een bronversie of hash zodat wijzigingen traceerbaar zijn.
- Voeg JSON Schema of runtime-validatie toe aan de gegenereerde receptdata.
- Houd Docker-images klein, non-root, read-only waar mogelijk en zonder development dependencies in de runtime-image.
- Voeg een healthcheck toe en documenteer logging, caching en rollback. De statische container mag geen persoonsgegevens of planninggegevens ontvangen.
- Gebruik SemVer, release notes en een eenvoudige deprecationprocedure voor data- en API-wijzigingen, ook al is de eerste versie statisch.

## Veiligheid en privacy

- Geen database, accounts, analytics, tracking of server-side opslag van weekplanningen in de eerste versie.
- Valideer alle gegenereerde JSON en behandel recepttekst als data; render tekst veilig zonder HTML-injectie of onveilige HTML.
- Gebruik een strikte Content Security Policy, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, passende `Permissions-Policy` en HTTPS in productie.
- Configureer Nginx voor veilige headers, correcte SPA-fallback, lange cacheheaders alleen voor gehashte assets en geen directory listing.
- Houd dependency- en containerbeveiliging bij; scan ook buildscripts omdat PDF-extractie met externe bestanden werkt.
- Voeg geen logo’s, recepten of fonts toe zonder licentie- en distributiecontrole. Documenteer provenance en copyright in `NOTICE`.
- Test dat `localStorage` corruptie of oude versies veilig terugvallen naar een lege planning. Exporteer geen opslaggegevens naar logs of externe services.

## Commit-, branch- en reviewbeleid

Alle commit messages, branchnamen, pull requests, issues en code-/ontwikkelaarsdocumentatie zijn Engels. Nederlandse tekst is uitsluitend voor gebruikersinterface, foutmeldingen, PDF’s en andere eindgebruikersuitvoer.

Gebruik Conventional Commits, bijvoorbeeld:

- `feat: add weekly meal planner`
- `fix: prevent duplicate recipe selections`
- `docs: describe recipe extraction`
- `ci: add dependency review workflow`
- `chore: update pinned actions`

Commits zijn klein, logisch samenhangend en bevatten geen gegenereerde artefacts, secrets, editorbestanden of ongerelateerde wijzigingen. Pull requests bevatten samenvatting, risico’s, testbewijs, screenshots voor UI-wijzigingen en licentie-impact. Bescherm `main`, vereis CI en minimaal één review zodra samenwerking via GitHub actief is.

## Aanvullende validatie

- Controleer de uiteindelijke repository met een licensee- of REUSE-achtige licentiecheck.
- Controleer met secret scanning dat geen sleutels, persoonlijke paden of lokale configuratie worden gecommit.
- Test GitHub Actions met een minimale wijziging en controleer dat forks geen deploy- of registry-secrets kunnen gebruiken.
- Documenteer een maintainer-checklist voor releases: receptbron controleren, logo-/licentierechten controleren, CI groen, securityscan groen, SBOM aanwezig en rollback getest.
- Configureer lokale Git-controles via `.pre-commit-config.yaml` en `commitlint`: formatter/linter, markdownlint, YAML-validatie, secret scanning en relevante tests vóór commit; houd hooks snel en bied een expliciete bypass alleen voor noodgevallen.
- Voeg controles toe voor GitHub Actions en Docker-configuratie, zoals `actionlint`, `hadolint` en een image-scan met `Trivy`; voer de belangrijkste controles zowel lokaal als in GitHub Actions uit.
- Documenteer Docker Desktop als ondersteunde lokale testomgeving met concrete `docker build`- en `docker run`-commando’s, poortmapping, healthcheck en troubleshooting.
