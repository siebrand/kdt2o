---
name: recipe-text-to-json
description: Convert free-text recipes into valid Kitano meal-planner recipe JSON, preserving uncertainty and following the app's ingredient, category, approval, and method conventions.
metadata:
  short-description: Convert free-text recipes to Kitano JSON
---

# Recipe text to Kitano JSON

Convert a user's free-text recipe into one JSON recipe object compatible with
the authoritative `schemas/schema.json` and `public/recipes.json` in the Kitano meal
planner. Read `schemas/schema.json` before producing output.

## Output contract

- Return valid JSON only when the user asks for an importable recipe object.
- Return a JSON array when the user provides multiple recipes.
- Keep all recipe content and user-facing values in Dutch.
- Use a stable lowercase kebab-case `id` derived from the title. Preserve an
  existing explicit ID when provided.
- Set `approved` to `false` unless the user explicitly says the recipe has been
  reviewed and approved.
- Use `category` as exactly one of `ontbijt`, `lunch`, or `diner`. Ask when it
  cannot be inferred safely; do not invent a category.
- If dietary classification is provided, use the optional `diet` array with one
  of `["vlees"]`, `["vis"]`, `["vlees", "vis"]`, `["vegetarisch"]`, or
  `["vegan"]`. Do not combine `vegetarisch` or `vegan` with `vlees` or `vis`.
- If program suitability is provided, use the optional `programs` array with one
  or more program names. Keep each program name as a string and do not duplicate
  names within the array.
- Use numeric `portions` when known. Ask when portions are essential and absent;
  do not silently assume a serving count.
- Set `multiDay` to `false` unless the text clearly describes a multi-day dish.
  For multi-day recipes, include a numeric `days` value when stated.
- Emit every top-level field listed as required by `schema.json`. Use safe empty
  defaults for absent optional content: `components: []`, `equipment: []`,
  `notes: []`, `days: 0`, `ovenTime: 0`, and `preparationTime: 0` only when the
  schema requires those fields and the project convention accepts zero.

## Ingredient normalization

Every ingredient must be an object with:

```json
{
  "raw": "2 rijpe tomaten",
  "amount": 2,
  "unit": "",
  "name": "tomaat",
  "optional": false,
  "category": "Groente en fruit"
}
```

- Preserve the original ingredient wording in `raw`.
- Normalize `amount` to a number when the quantity is explicit; use `null` for
  an unquantified ingredient. Never store a number as a string. For a range
  such as `1-2 preien`, keep the range in `raw` and store the maximum
  (`2`) in `amount`.
- `amount` and `unit` drive only the shopping list; `raw` keeps the recipe
  wording. Express them the way the ingredient is bought:
  - Liquids in `ml` (1 el = 15 ml, 1 tl = 5 ml).
  - Solids in `gram`, including Griekse yoghurt and fresh herbs (1 el of
    chopped herbs ≈ 4 g, 1 basil leaf ≈ 0.5 g, 1 sprig ≈ 1 g).
  - Dried spices, salt, mustard, and baking powder in `tl` (1 el = 3 tl).
  - Countable items (`2 tomaten`) with an empty unit; never use `stuk` as an
    ingredient unit.
  Do not use `el` as an ingredient unit.
- For vague pantry amounts, use fixed estimates: a scheut, scheutje, or
  unquantified olive oil is 15 ml; a klontje or unquantified butter is
  10 gram.
- Normalize `name` to a concise singular shopping-list name without removing
  meaningful qualifiers such as `(diepvries)`. Use natural Dutch product
  names (`rode paprika`, `gerookte zalm`, `tomatenblokjes`), and keep
  amounts, packaging, brands, and preparation notes in `raw` only. Reuse an
  existing name from `public/recipes.json` when the product is the same.
- Set `optional: true` only when the source marks the ingredient as optional or
  presents it as an optional finishing choice.
- Assign one Dutch shopping category, normally `Groente en fruit`, `Zuivel en
  eieren`, `Vlees, vis en vleesvervangers`, `Houdbare producten`, `Diepvries`,
  `Brood en ontbijt`, or `Kruiden en smaakmakers`. Check the current
  `public/recipes.json` when a newer category appears in the project.
- Represent explicit substitutions in an `alternatives` array using the same
  ingredient-object shape. Do not merge alternatives into the main ingredient.
- Emit `alternatives: []` and `componentId: ""` when required by the schema and
  the ingredient is not an alternative or component ingredient.
- Use `componentId` to associate an ingredient with a component; do not infer a
  component relationship from the ingredient name alone.

## Recipe structure

Include these fields in this order when applicable:

1. `id`, `title`, `approved`, `category`, `portions`, `multiDay`, `days`
2. `preparationTime`, `ovenTime`
3. `ingredients`, `components`, `dailyVariants`, `equipment`
4. `method`, `notes`, `advanceNotice`

Use `method` as plain text. Keep steps in a readable Dutch paragraph or separate
sentences; never emit HTML or Markdown inside recipe fields. Use `components`
for separately prepared subrecipes. Components must include the required
`id`, `title`, `yield`, `ingredients`, `equipment`, `method`, `yieldUnit`, and
  `yieldNote` fields from `schemas/schema.json`; use an empty string, empty array, or
`false` only where that is an appropriate schema-compatible default. Use
`dailyVariants` only when the source genuinely gives
day-specific variants, with a zero-based numeric `dayIndex`.

Set `preparationTime` and `ovenTime` only when stated or reliably derivable
from explicit timing. Do not convert vague phrases such as “even bakken” into
invented minutes.

## Workflow

1. Extract the title, meal category, portions, timings, ingredients, method,
   optional ingredients, alternatives, equipment, and multi-day information.
2. Identify facts that are missing or ambiguous. Ask focused questions if the
   ambiguity would affect shopping-list quantities, meal category, servings, or
   planning behavior. Otherwise, preserve the uncertainty with `null`, an empty
   unit, or a note rather than guessing.
3. Normalize the extracted data into the schema above.
4. Validate the result against `schemas/schema.json`, then check that it contains no
   comments or trailing commas and has no HTML in recipe text.
5. If the user wants to add it to the repository, show the proposed object and
   identify the target file before making the edit. Do not mark it approved
   merely because it was converted.

For the detailed field reference and a complete example, read
`references/kitano-recipe-schema.md` from this skill.
