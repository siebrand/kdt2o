# Design: review of the recipe candidates

Status: proposed. Nothing of this design is implemented.

## Goal

The owner reviews the 512 recipes in `data/candidates.json`. For each recipe
the owner rejects it, approves it, or asks for a change. The decision goes back
to the repository:

- **Approve**: the recipe moves to `public/recipes.json` with `approved: true`.
- **Reject**: the recipe goes out of `data/candidates.json` and does not come
  back.
- **Change**: the recipe stays a candidate. An agent or a person makes the
  change, and the recipe returns to the review.

## Constraints

- The site stays static and public. It has no server storage, and it does not
  publish the candidates (ADR 0008).
- A recipe cannot get `approved: true` while it has open `review` items or an
  ingredient with the flag `sweetener`, `honey`, or `sugar`.
- Nothing is pushed. The owner looks at the commits and pushes.

## Overview

```text
data/candidates.json ──> review page (local) ──> data/review-decisions.json
                                                      │
                     scripts/apply_review.py <────────┘
                        │           │          │
                     approve      reject     change
                        │           │          │
        public/recipes.json   removed     note for the agent
```

There are three parts. The decision file is the contract between them, so each
part can change without the others. An agent or a text editor can also write
the decision file.

### 1. Review page

`scripts/review.py` starts a server on `127.0.0.1` and opens the page in
`review/`. The page is outside `public/`, so the Docker image and the Pages
deployment cannot publish it. The script uses only the Python standard library.

For one candidate at a time, the page has:

- The title, meals, portions, days, diet, times, and nutrition values.
- The ingredients, with the recipe text (`raw`) next to the amount, unit, name,
  and category for the shopping list, and the flags.
- The method, numbered in steps, and the subrecipes.
- The `review` items, each with a check box for "solved".
- A link to the `source`, which opens in a new tab.
- The buttons **Goedkeuren**, **Afwijzen**, **Wijzigen**, and **Overslaan**,
  with the keys `a`, `x`, `w`, and `s`. **Ongedaan maken** has the key `u`.

Rules of the page:

- **Goedkeuren** works only when each `review` item is checked and no
  ingredient has a blocking flag.
- **Afwijzen** needs a reason from a short list, such as "ingrediënt",
  "koolhydraten", "dubbel", "past niet", with an optional note.
- **Wijzigen** needs a note in plain words, for example "2 eieren in plaats van
  2,5; laat de kaas weg". The page does not edit the recipe. This keeps the
  page small, and the edit becomes a normal, validated change.
- The text is data. The page inserts it with text APIs, never as HTML.
- All text on the page is Dutch and uses "weergeven".

The page has filters on meal, diet, and type of review item. The order puts the
141 candidates without review items first, then those with one item. A counter
shows how many candidates are open.

The server saves each decision immediately, so closing the page loses nothing.
It accepts only requests with its own `Host` and a random token from the start
of the script, so another website cannot send decisions to it.

### 2. Decision file

`data/review-decisions.json` is an object, sorted by recipe ID:

```json
{
  "broccoli-met-citroenboter": {
    "decision": "approve",
    "solved": [],
    "fingerprint": "3f9a1c02",
    "date": "2026-11-25"
  },
  "courgette-rolletjes-schotel": {
    "decision": "change",
    "note": "3 eieren in plaats van 2 ½; halve paprika",
    "fingerprint": "b77e0d41",
    "date": "2026-11-25"
  },
  "koolhydraatarme-sushi": {
    "decision": "reject",
    "reason": "past niet",
    "note": "geen volledige maaltijd",
    "fingerprint": "90aa5512",
    "date": "2026-11-25"
  }
}
```

`solved` lists the notes of the review items that the owner checked.
`fingerprint` is a hash of the candidate at the time of the decision. If the
candidate changes afterwards, the old decision does not apply any more and the
candidate returns to the review. Thus nobody approves a text that they did not
see.

The file is local and in `.gitignore`. Only the result of part 3 goes into Git.

### 3. Applying the decisions

`scripts/apply_review.py` reads the decisions and reports what it will do. It
changes files only with `--write`:

| Decision | Result |
| --- | --- |
| approve | Remove the solved `review` items, set `approved: true`, and move the recipe from the candidates to the end of `public/recipes.json`. |
| reject | Remove the recipe from the candidates. Add its ID, source URL, reason, and date to `data/rejected.json`. |
| change | Leave the recipe. Print the note, so that an agent can make the change. |

For all decisions it first checks the fingerprint. It then runs the rules of
`scripts/validate_recipes.py` on the result in memory and writes nothing if
there is an error. It removes the applied decisions from the decision file.

`data/rejected.json` is committed. The local conversion script skips each
source URL and title in it, so a new conversion does not bring a rejected
recipe back. The validator refuses a candidate that is in this file. The reason
also shows patterns: if many recipes fail on one ingredient, a rule in the
conversion is better than more reviews.

The script does not commit. One batch becomes one or two commits: one for the
approved recipes and one for the rejected recipes.

## Feedback to the agent

There are two ways to give feedback. Both end in the decision file.

1. **The page.** After a session the owner writes "verwerk de review" in the
   chat. The agent reads `data/review-decisions.json`, makes each requested
   change in `data/candidates.json`, runs `apply_review.py`, runs the checks,
   commits, and reports. The changed candidates return to the page with a mark
   "gewijzigd", with the note and the new text.
2. **The chat.** The owner writes for example "wijs sushi af, te ingewikkeld"
   or "keur de eerste vijf goed". The agent writes the same decisions to the
   file, with the fingerprint of the current candidate. If the request can
   refer to more than one recipe, the agent asks first.

A general remark, such as "nooit ketchup", is not a decision for one recipe. The
agent applies it to all candidates as a batch of rejections or changes, reports
the list before it writes, and records the rule.

## Moving a recipe to the site

- An approved recipe keeps its ID. Share links and saved plans use a hash of
  the ID, so the ID must not change after the recipe is on the site.
- A candidate that refers to a shared subrecipe, such as `lijnzaadcrackers`,
  works at once, because that subrecipe is already in `public/recipes.json`.
- The bigger list makes the recipe chooser longer. Filters and "Meer weergeven"
  in the chooser are separate work, needed before some hundreds of approvals.

## Tests

- `apply_review.py`: approve moves and cleans; reject removes and records;
  change leaves; an old fingerprint, an unsolved item, or a blocking flag stops
  the decision; a validation error writes nothing; a second run changes
  nothing.
- The server: it refuses a wrong token and a wrong `Host`, saves a decision,
  and undoes it.
- The page, in the browser: the approve button stays off until all items are
  checked; the keys work; recipe text with `<b>` is not HTML.
- The validator: a candidate in `data/rejected.json` is an error.

## Alternatives

- **Review in the public site.** Rejected: it would publish the candidates and
  cannot write to the repository without a server or a token.
- **A pull request or an issue for each recipe.** Rejected: 512 of them, and the
  recipe is hard to read in a JSON diff.
- **Editing the recipe in the page.** Postponed: a form for ingredients,
  subrecipes, and flags is most of the work, and a note to the agent does the
  same.
- **Decisions only in the chat.** Kept as the second way, but too slow for 512
  recipes.

## Order of work

1. The decision file, `apply_review.py`, `data/rejected.json`, the validator
   rule, and the tests. The chat can then already reject and approve.
2. `review.py` and the page.
3. A first batch of 20 recipes, then changes to the design.
4. Filters in the recipe chooser, when many recipes are approved.

Write an ADR for the parts that are built. Update `AGENTS.md`,
`CONTRIBUTING.md`, and `docs/architecture.md` with them.
