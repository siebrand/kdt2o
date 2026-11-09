# Kitano recipe schema reference

The authoritative schema is `schemas/schema.json` in the repository. The maintained
browser data is the array in `public/recipes.json`. Read and validate against
`schemas/schema.json`; this reference is only an operational summary.

## Required top-level fields

Every recipe object must include:

- `id`, `title`, `approved`, `category`, `portions`, `multiDay`
- `ingredients`, `method`
- `components`, `preparationTime`, `days`, `equipment`, `notes`, `ovenTime`

Optional dietary classification:

- `diet`: an array containing `["vlees"]`, `["vis"]`, `["vlees", "vis"]`,
  `["vegetarisch"]`, or `["vegan"]`.
- `vegetarisch` and `vegan` cannot be combined with `vlees` or `vis`.

When the source does not provide a value, preserve uncertainty where the schema
allows it. For required fields that are arrays, use an empty array. Use project
conventions for required numeric defaults; do not invent timings or servings.

## Main ingredients

Each main ingredient requires:

- `raw`: original Dutch ingredient wording
- `amount`: number, string, or `null`
- `unit`: string or `null`
- `name`: normalized shopping-list name
- `optional`: boolean
- `category`: Dutch shopping category
- `alternatives`: array of alternative ingredient objects
- `componentId`: string linking the ingredient to a component, or `""`

Alternative objects require `raw`, `amount`, `unit`, `name`, `optional`,
`category`, and `componentId`. Preserve explicit substitutions as
alternatives; do not put them into the main ingredient name.

## Components

Each component requires:

- `id`, `title`, `yield`, `yieldUnit`, `yieldNote`
- `ingredients`, `equipment`, and `method`

Component ingredients require `raw`, `amount`, `unit`, `name`,
`optional`, and `category`. Components may also use `optional`,
`availabilityNote`, and `includeInShoppingList`.

## Other structures

- `dailyVariants` entries require numeric `dayIndex`, `title`,
  `ingredients`, and `method`.
- `equipment` is an array of Dutch plain-text item names.
- `notes` is an array of Dutch plain-text notes.
- `preparationTime` and `ovenTime` are numeric minutes.
- `days` is numeric and is used with `multiDay`.
- Recipe `category` is a meal category such as `ontbijt`, `lunch`, or
  `diner`; ingredient `category` is a shopping category.

Ingredient categories currently present in the data include:

- `Groente en fruit`
- `Zuivel en eieren`
- `Vlees, vis en vleesvervangers`
- `Houdbare producten`
- `Diepvries`
- `Brood en ontbijt`
- `Kruiden en smaakmakers`

All recipe text is plain Dutch text. Do not emit HTML, Markdown, comments, or
trailing commas in JSON.
