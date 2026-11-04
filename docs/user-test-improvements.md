# User test improvement proposals

Source: user test transcript with Marjolijn Mazeland; the original transcript is
not retained in the repository.

Use one decision per item:

- **Approve:** implement the proposal.
- **Reject:** do not implement it.
- **Decision:** leave blank until reviewed.

## 1. Make the planning completion action explicit

**Observation:** Marjolijn could not immediately find how to create or view the shopping list. “Download PDF” did not communicate the completion flow clearly.

**Proposal:** Add a prominent completion action such as **“Afronden en boodschappenlijst bekijken”**. The action should first show the shopping list in the application and then offer PDF download.

**Acceptance criteria:**

- The action is visible when at least one meal is planned.
- The shopping list can be reviewed before downloading.
- PDF download remains available from the shopping-list view.

**Decision:** [ ] Approve  [ ] Reject

## 2. Add a weekly grid overview to the PDF

**Observation:** The recipe-by-recipe PDF was experienced as difficult to scan. The existing planner grid was preferred.

**Proposal:** Add a weekly overview page to the PDF that mirrors the application grid, with days as columns and breakfast, lunch, and dinner as rows.

**Acceptance criteria:**

- The first planning page shows Monday through Sunday in one consistent grid.
- Multi-day recipes are visible on every planned day.
- The grid appears before the shopping list and recipe pages.

**Decision:** [ ] Approve  [ ] Reject

## 3. Optimize the weekly overview for printing

**Observation:** The requested printable format should make Monday through Sunday easy to compare at a glance.

**Proposal:** Use an A4 landscape page for the weekly overview, with print-safe spacing and readable text.

**Acceptance criteria:**

- The weekly grid fits on one A4 landscape page.
- The page prints without clipping or unexpected page breaks.
- The remaining PDF pages can retain portrait orientation where appropriate.

**Decision:** [ ] Approve  [ ] Reject

## 4. Validate and audit shopping-list quantities

**Observation:** The test exposed incorrect quantities and duplicate-looking entries, including lemons, courgettes, and stock cubes.

**Proposal:** Add a shopping-list validation step that checks aggregation, units, singular/plural forms, and duplicate ingredients before the list is shown or exported.

**Acceptance criteria:**

- Compatible ingredients are combined only when their units are compatible.
- Incompatible or ambiguous quantities remain separate and are visibly flagged.
- Common forms such as “4 citroenen”, “5 courgettes”, and stock cubes are rendered correctly.
- A build-time or test-time report identifies suspicious quantities.

**Decision:** [ ] Approve  [ ] Reject

## 5. Review supermarket categorization

**Observation:** Most categories were useful, but at least some items appeared in the wrong category.

**Proposal:** Review and test the categorization rules, add an explicit fallback category, and produce a report of uncategorized or low-confidence ingredients.

**Acceptance criteria:**

- Every shopping-list item has exactly one category.
- Known supermarket items appear in the expected category.
- Ambiguous items are listed in a review report instead of silently being misclassified.
- Category names remain consistent between the application and PDF.

**Decision:** [ ] Approve  [ ] Reject

## 6. Group recipe details by day in the PDF

**Observation:** Scrolling through recipe pages by recipe was experienced as unclear. The preferred structure is one day at a time, with breakfast, lunch, and dinner together.

**Proposal:** Organize the recipe section by day. Each day should contain breakfast, lunch, and dinner in that order, followed by the next day.

**Acceptance criteria:**

- Each day has a clear heading.
- Empty meal slots are handled without confusing gaps.
- Multi-day recipes appear under each relevant day without requiring the reader to search through the document.

**Decision:** [ ] Approve  [ ] Reject

## 7. Add navigation from the weekly overview to recipes

**Observation:** Marjolijn wanted to move from the planning overview directly to the corresponding recipe.

**Proposal:** Add clickable links from each planned meal in the PDF overview to its recipe section. Add back-navigation links where supported by the PDF format.

**Acceptance criteria:**

- Each planned meal links to the correct recipe page or section.
- Links remain correct when recipes are reordered.
- The printed version remains understandable without links.

**Decision:** [ ] Approve  [ ] Reject

## 8. Make multi-day recipes self-explanatory

**Observation:** The Monday/Wednesday/Friday placement was only understood after explanation.

**Proposal:** Add a short explanation next to multi-day recipes in the planning grid and weekly PDF overview, for example: **“Bereid voor 3 dagen: maandag, woensdag en vrijdag.”**

**Acceptance criteria:**

- The repeated days are visibly connected to the same recipe.
- The user does not need verbal explanation to understand why the recipe appears multiple times.
- The explanation distinguishes preparation day from eating days where that distinction matters.

**Decision:** [ ] Approve  [ ] Reject

## 9. Keep recipe ordering random

**Observation:** Marjolijn explicitly preferred a random recipe order and did not request sorting or filtering changes.

**Proposal:** Keep the current random ordering behavior. Do not add alphabetical ordering by default.

**Decision:** [ ] Approve  [ ] Reject
