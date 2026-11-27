# ADR 0010: Export the shopping list as versioned JSON

## Status

Accepted.

## Decision

The planner exports the weekly shopping list as a JSON file in the browser, next to the PDF. The file has the
format `kitano-shopping-list`, version 1, which `docs/shopping-list-format.md` specifies and
`schemas/shopping-list.schema.json` validates. The planner is the owner of the format; consumers copy the schema.

The file contains the totals that the planner displays: the normalized name, the quantity as a range with a
normalized unit, the optional flag, the category, and the Dutch label. It does not contain recipe text or plan
dates.

`planShoppingListDocument()` in `public/shopping-export.js` makes the document from a plan and the recipes, without
the page. The browser uses it for the download. A program can run a copy of the modules to make the same document
from a share link and `recipes.json`, so the totals are computed in one place only.

A consumer rejects an unknown `formatVersion` and ignores unknown properties. A breaking change gets a new version,
a new schema file, and a new ADR.

## Consequences

Programs such as `shop-at-picnic` can prepare groceries without parsing the PDF or the HTML. The application stays
static: the export uses no server, and the file goes only where the user puts it. The browser tests validate each
export against the schema, so a change to the shopping list that breaks the format fails CI.
