# Kitano recipe schema reference

The authoritative schema is `schemas/schema.json` in the repository. The maintained
browser data is the array in `public/recipes.json`. Read and validate against
`schemas/schema.json`; this reference is only an operational summary. In the
repository, `pre-commit run --all-files` runs `scripts/validate_recipes.py`,
which applies the schema plus rules a schema cannot express.

## Required top-level fields

Every recipe object must include:

- `id`, `title`, `approved`, `category`, `portions`, `multiDay`
- `ingredients`, `method`, `diet`

`id` is a lowercase slug (`a-z`, `0-9`, and single hyphens). Saved plans and
share links store a hash of the ID, so never change the ID of a published
recipe; correct the `title` instead.

`diet` is an array containing `["vlees"]`, `["vis"]`, `["vlees", "vis"]`,
`["vegetarisch"]`, or `["vegan"]`. `vegetarisch` and `vegan` cannot be
combined with `vlees` or `vis`.

## Optional top-level fields

- `days`: an integer of at least 2. Required when `multiDay` is `true`, and
  not allowed otherwise.
- `preparationTime` and `ovenTime`: positive whole minutes.
- `programs`: an array of one or more unique program names for which the
  recipe is suitable.
- `components`, `dailyVariants`, `equipment`, `notes`, `advanceNotice`.

Omit an optional field when the source provides no value. Do not use
placeholders such as `0`, empty strings, or empty arrays, and do not invent
timings or servings. No other fields are allowed.

## Ingredients

Each ingredient requires:

- `raw`: original Dutch ingredient wording
- `amount`: a positive number, or `null` when unquantified; never a string
- `unit`: a string, empty for countable or unitless items
- `name`: normalized shopping-list name
- `optional`: boolean
- `category`: one of the shopping categories below

Ingredients may also have:

- `alternatives`: an array of alternative ingredient objects with the same
  required fields. Preserve explicit substitutions as alternatives; do not put
  them into the main ingredient name.
- `componentId`: the `id` of a component in the same recipe, or of a shared
  component defined in another recipe, such as `lijnzaadcrackers`, `granola`,
  or `notenbrood`. Only a `componentId` on a main or daily-variant ingredient
  attaches a shared component; do not copy shared components into recipes.

## Components

Each component requires `id`, `title`, `ingredients`, and `method`. Components
may also use `yield`, `yieldUnit`, `yieldNote`, `equipment`, `optional`,
`availabilityNote`, `includeInShoppingList`, `preparationTime`, and
`ovenTime`. Component IDs must be unique within a recipe.

## Other structures

- `dailyVariants` entries require a zero-based integer `dayIndex` within the
  planned `days`, plus `title`, `ingredients`, and `method`.
- `equipment` is an array of Dutch plain-text item names.
- `notes` is an array of Dutch plain-text notes.
- Recipe `category` is one of `ontbijt`, `lunch`, or `diner`; ingredient
  `category` is a shopping category.
- Recipe IDs and titles must be unique.

Shopping categories:

- `Groente en fruit`
- `Zuivel en eieren`
- `Vlees, vis en vleesvervangers`
- `Brood en ontbijt`
- `Diepvries`
- `Kruiden en smaakmakers`
- `Houdbare producten`

All recipe text is plain, NFC-normalized Dutch text. Do not emit HTML,
Markdown, comments, or trailing commas in JSON.
