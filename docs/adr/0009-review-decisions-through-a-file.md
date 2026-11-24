# ADR 0009: Apply review decisions from a local file

## Status

Accepted. Adds to ADR 0008.

## Decision

The owner decides on each recipe candidate: approve, reject, change, or skip.
`data/review-decisions.json` holds the decisions. This file is local and not in
Git. `scripts/apply_review.py` applies it:

- An approved candidate moves to `public/recipes.json`.
- A rejected candidate goes to `data/rejected.json`, with a reason. The
  validator refuses a candidate that is in this list.
- A candidate that needs a change stays. A person or an agent makes the change.

Each decision has a fingerprint of the candidate that the owner saw. The
decision does not apply after the candidate changes. An approval needs each
review item to be marked as solved. The script writes nothing if the result is
not valid.

The file separates the decision from the place where it is made. An agent can
write it from a chat now, and a local review page can write it later.

## Consequences

A rejected recipe does not come back through a new conversion. The owner does
not approve a text that the owner did not see. The decisions that are not
applied yet exist only on the computer of the owner.
