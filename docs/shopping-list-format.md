# Shopping-list format, version 1

The planner exports the weekly shopping list as a JSON file, `boodschappenlijst.json`, for programs such as
shop-at-picnic that prepare groceries from it. This document is the
specification. [`schemas/shopping-list.schema.json`](../schemas/shopping-list.schema.json) is the machine-readable
part of it, with the identifier `urn:kitano:kdt2o:shopping-list:1`; the browser tests validate every export against
it.

The key words "must", "must not", "should", and "may" are to be interpreted as described in
[RFC 2119](https://www.rfc-editor.org/rfc/rfc2119).

## Example

```json
{
  "format": "kitano-shopping-list",
  "formatVersion": 1,
  "createdAt": "2026-11-27T10:15:00.000Z",
  "generator": {"name": "kdt2o", "version": "2026-11-27.000000000123-0123456789abcdef0123456789abcdef01234567"},
  "language": "nl",
  "recipes": [
    {"id": "bloemkoolpizza", "title": "Bloemkoolpizza"}
  ],
  "items": [
    {
      "name": "champignons",
      "quantity": {"min": 250, "max": 250, "unit": "gram"},
      "optional": false,
      "category": "Groente en fruit",
      "label": "250 gram champignons"
    },
    {
      "name": "champignons",
      "quantity": {"min": 100, "max": 100, "unit": "gram"},
      "optional": true,
      "category": "Groente en fruit",
      "label": "100 gram champignons"
    },
    {
      "name": "zout",
      "quantity": null,
      "optional": false,
      "category": "Kruiden en smaakmakers",
      "label": "zout"
    }
  ]
}
```

## Document

| Property        | Type             | Meaning                                                                       |
|-----------------|------------------|-------------------------------------------------------------------------------|
| `format`        | string           | Always `kitano-shopping-list`.                                                |
| `formatVersion` | integer          | The major version of the format, `1` for this document.                       |
| `createdAt`     | string           | The export time, an RFC 3339 timestamp in UTC.                                |
| `generator`     | object           | `name` is `kdt2o`; `version` is the planner's CalVer version, `local`, or `null`. |
| `language`      | string           | The language of names, labels, and categories: `nl`.                          |
| `recipes`       | array of objects | The planned recipes, once each, with their `id` and `title`.                  |
| `items`         | array of objects | The shopping-list totals, in the order the planner lists them.                |

## Item

| Property   | Type           | Meaning                                                                                  |
|------------|----------------|------------------------------------------------------------------------------------------|
| `name`     | string         | The normalized ingredient name: lowercase, and singular where the planner knows it. Consumers match products on this value. |
| `quantity` | object or null | The total, or `null` when no recipe gives an amount, as for "zout".                      |
| `optional` | boolean        | `true` for the extra amount that recipes list as optional.                               |
| `category` | string         | One of the planner's eight Dutch shopping categories.                                    |
| `label`    | string         | The Dutch text the planner displays for the item, for people.                            |

A `quantity` has `min`, `max`, and `unit`. `min` equals `max` for an exact amount; a range such as "1-2" has a
different `max`. Both are positive numbers and are not rounded. `unit` is the planner's normalized unit, such as
`gram`, `ml`, `liter`, `stuk`, `el` (tablespoon), `tl` (teaspoon), `teen`, `blik`, `bosje`, `takje`, or `hand`. An
amount without a unit has the unit `stuk`.

The planner adds amounts only for the same normalized name and unit, so the same `name` can appear more than once:

- with different units, for example once in `gram` and once in `stuk`;
- once as needed and once as optional, as for the champignons in the example. A consumer must not treat the
  optional item as a replacement for the needed one;
- once with a quantity and once without, when only some recipes give an amount.

## Compatibility

- A consumer must check `format` and `formatVersion`, and must reject a version it does not support.
- A consumer must ignore properties it does not know. A new optional property does not change `formatVersion`.
- A change that removes or renames a property, changes its type or meaning, or makes a new property required
  increases `formatVersion`, gets a new schema file and identifier, and is recorded in an ADR.
- A consumer should treat a `unit` it does not know as not convertible.

## Privacy

The file holds only the shopping list and the titles of the planned recipes. The planner makes it in the browser and
sends it nowhere; the user decides where it goes.
