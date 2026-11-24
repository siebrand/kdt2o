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
- Use `categories` as a list of one or more of `ontbijt`, `lunch`, and
  `diner`: the meals for which the recipe fits. Ask when they cannot be
  inferred safely; do not invent a category.
- Set the required `diet` array to one of `["vlees"]`, `["vis"]`,
  `["vlees", "vis"]`, `["vegetarisch"]`, or `["vegan"]`, based on the
  non-optional ingredients. Do not combine `vegetarisch` or `vegan` with
  `vlees` or `vis`.
- If program suitability is provided, use the optional `programs` array with one
  or more program names. Keep each program name as a string and do not duplicate
  names within the array.
- Use numeric `portions` when known. Ask when portions are essential and absent;
  do not silently assume a serving count.
- Set `multiDay` to `false` unless the text clearly describes a multi-day dish.
  For multi-day recipes, include a numeric `days` value when stated.
- Emit every field listed as required by `schema.json`. Omit optional fields
  that have no content instead of using placeholders: never emit `days: 0`,
  `ovenTime: 0`, `preparationTime: 0`, an empty `advanceNotice`, or empty
  arrays.

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
- Omit `alternatives` and `componentId` when an ingredient has none.
- Use `componentId` to associate an ingredient with a component; do not infer a
  component relationship from the ingredient name alone.

## Recipe structure

Include these fields in this order when applicable:

1. `id`, `title`, `approved`, `categories`, `portions`, `multiDay`, `days`
2. `preparationTime`, `ovenTime`
3. `ingredients`, `components`, `dailyVariants`, `equipment`
4. `method`, `notes`, `advanceNotice`

Use `method` as plain text. Keep steps in a readable Dutch paragraph or separate
sentences; never emit HTML or Markdown inside recipe fields. Use `components`
for separately prepared subrecipes. Components require `id`, `title`,
`ingredients`, and `method`; add `yield`, `yieldUnit`, `yieldNote`,
`equipment`, `preparationTime`, and `ovenTime` when the source states them. Use
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
   comments or trailing commas and has no HTML in recipe text. After adding it to
   `public/recipes.json`, run `pre-commit run --all-files`.
5. If the user wants to add it to the repository, show the proposed object and
   identify the target file before making the edit. Do not mark it approved
   merely because it was converted.

For the detailed field reference and a complete example, read
`references/kitano-recipe-schema.md` from this skill.
