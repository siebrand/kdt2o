#!/usr/bin/env python3
"""Review the candidates in data/candidates.json and apply the decisions.

- next: print the next candidates to review, with their fingerprints.
- decide: save one decision in data/review-decisions.json, which is local.
- apply: report what the decisions do; with --write, do it.

An approved candidate moves to public/recipes.json. A rejected candidate goes
to data/rejected.json, so that it does not come back. A candidate that needs a
change stays, and the script prints the note. A decision is for the candidate
with the fingerprint that the owner saw. After a change of the candidate the
decision does not apply, and the candidate is open again. The script writes
nothing if the result is not valid. See docs/design/recipe-review.md.
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import sys
from datetime import date
from pathlib import Path

import validate_recipes

ROOT = Path(__file__).resolve().parent.parent
REASONS = ("ingrediënt", "koolhydraten", "dubbel", "past niet", "ingewikkeld", "te licht", "anders")
DECISIONS = ("approve", "reject", "change", "skip")


class Files:
    """The four data files below a root folder."""

    def __init__(self, root: Path = ROOT) -> None:
        self.recipes = root / "public" / "recipes.json"
        self.candidates = root / "data" / "candidates.json"
        self.rejected = root / "data" / "rejected.json"
        self.decisions = root / "data" / "review-decisions.json"


def load(path: Path, default=None):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() or default is None else default


def save(path: Path, value) -> None:
    temporary = path.with_name(path.name + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


def fingerprint(candidate: dict) -> str:
    text = json.dumps(candidate, ensure_ascii=False, sort_keys=True)
    return hashlib.sha256(text.encode()).hexdigest()[:12]


def review_notes(candidate: dict) -> list[str]:
    return [item["note"] for item in candidate.get("review", [])]


def open_candidates(candidates: list[dict], decisions: dict) -> list[dict]:
    """Candidates without a decision that still applies; the fewest review items first, skipped ones last."""
    current = {candidate["id"]: decisions[candidate["id"]]["decision"] for candidate in candidates
               if decisions.get(candidate["id"], {}).get("fingerprint") == fingerprint(candidate)}
    result = [candidate for candidate in candidates if current.get(candidate["id"]) in (None, "skip")]
    return sorted(result, key=lambda c: (current.get(c["id"]) == "skip", len(review_notes(c)), c["id"]))


def make_decision(candidate: dict, decision: str, seen: str, *, reason: str = "", note: str = "",
                  solved: list[str] | None = None, today: date | None = None) -> dict:
    """Return the decision to save, or raise ValueError."""
    if seen != fingerprint(candidate):
        raise ValueError(f"{candidate['id']}: the candidate changed after it was seen")
    if decision not in DECISIONS:
        raise ValueError(f"unknown decision {decision!r}")
    if decision == "reject" and reason not in REASONS:
        raise ValueError(f"a rejection needs a reason: {', '.join(REASONS)}")
    if decision == "reject" and reason == "anders" and not note:
        raise ValueError("the reason 'anders' needs a note")
    if decision == "change" and not note:
        raise ValueError("a change needs a note")
    result: dict = {"decision": decision}
    if decision == "approve":
        result["solved"] = solved or []
        missing = [item for item in review_notes(candidate) if item not in result["solved"]]
        if missing:
            raise ValueError(f"{candidate['id']}: {len(missing)} review item(s) are not solved: {'; '.join(missing)}")
    if decision == "reject":
        result["reason"] = reason
    if note:
        result["note"] = note
    return {**result, "fingerprint": seen, "date": (today or date.today()).isoformat()}


def plan(recipes: list[dict], candidates: list[dict], rejected: list[dict], decisions: dict) -> dict:
    """Apply the decisions to copies of the data, and return the result with the report."""
    recipes, remaining = copy.deepcopy(recipes), {c["id"]: copy.deepcopy(c) for c in candidates}
    rejected, left = copy.deepcopy(rejected), {}
    report: dict[str, list[str]] = {"approved": [], "rejected": [], "changes": [], "changed": [], "problems": []}
    for recipe_id, decision in sorted(decisions.items()):
        candidate = remaining.get(recipe_id)
        kind = decision.get("decision")
        if candidate is None:
            report["problems"].append(f"{recipe_id}: there is no such candidate")
            left[recipe_id] = decision
            continue
        if decision.get("fingerprint") != fingerprint(candidate):
            # A changed text is the expected result of the decision 'change'.
            report["changed" if kind == "change" else "problems"].append(
                f"{recipe_id}: changed after the decision '{kind}'; review it again")
            left[recipe_id] = decision
            continue
        if kind == "approve":
            unsolved = [note for note in review_notes(candidate) if note not in decision.get("solved", [])]
            approved = {**candidate, "approved": True}
            approved.pop("review", None)
            errors = [f"{recipe_id}: review item not solved: {note}" for note in unsolved]
            errors += [error for error in validate_recipes.rule_errors(recipes + [approved])
                       if error.startswith(f"{recipe_id}:")]
            if errors:
                report["problems"] += errors
                left[recipe_id] = decision
                continue
            recipes.append(approved)
            del remaining[recipe_id]
            report["approved"].append(f"{recipe_id}: {candidate['title']}")
        elif kind == "reject" and decision.get("reason") in REASONS:
            entry = {"id": recipe_id, "title": candidate["title"], "reason": decision["reason"], "date": decision["date"]}
            if decision.get("note"):
                entry["note"] = decision["note"]
            if candidate.get("source"):
                entry["source"] = candidate["source"]["url"]
            rejected.append(entry)
            del remaining[recipe_id]
            report["rejected"].append(f"{recipe_id}: {decision['reason']}")
        else:
            left[recipe_id] = decision
            if kind == "change":
                report["changes"].append(f"{recipe_id}: {decision.get('note', '')}")
            elif kind != "skip":
                report["problems"].append(f"{recipe_id}: the decision is not valid")
    return {"recipes": recipes, "candidates": [remaining[key] for key in sorted(remaining)],
            "rejected": sorted(rejected, key=lambda entry: entry["id"]), "decisions": left, "report": report}


def validation_errors(result: dict) -> list[str]:
    schema = load(validate_recipes.SCHEMA)
    return (validate_recipes.schema_errors(result["recipes"], schema) + validate_recipes.rule_errors(result["recipes"])
            + validate_recipes.candidate_errors(result["recipes"], result["candidates"], schema, result["rejected"]))


def describe(candidate: dict, previous: dict | None = None) -> str:
    lines = [f"# {candidate['title']}", f"id {candidate['id']}, fingerprint {fingerprint(candidate)}",
             f"{', '.join(candidate['categories'])}; {candidate['portions']} porties; {', '.join(candidate['diet'])}; "
             f"voorbereiden {candidate.get('preparationTime', '-')}, oven {candidate.get('ovenTime', '-')}; "
             f"voeding {json.dumps(candidate.get('nutrition', {}), ensure_ascii=False)}",
             f"bron {candidate.get('source', {}).get('url', '-')}"]
    parts = [("Recept", candidate["ingredients"], candidate["method"])]
    parts += [(c["title"], c["ingredients"], c["method"]) for c in candidate.get("components", [])]
    for title, ingredients, method in parts:
        lines.append(f"## {title}")
        for item in ingredients:
            shopping = " ".join(str(part) for part in (item["amount"], item["unit"], item["name"]) if part not in (None, ""))
            extra = ["optioneel"] * item["optional"] + item.get("flags", [])
            lines.append(f"- {item['raw']}  [{shopping}; {item['category']}{'; ' + ', '.join(extra) if extra else ''}]")
        lines.append(method)
    lines += [f"Notitie: {note}" for note in candidate.get("notes", [])]
    lines += [f"Te controleren: {note}" for note in review_notes(candidate)]
    if previous and previous["decision"] == "change" and previous["fingerprint"] != fingerprint(candidate):
        lines.append(f"Gewijzigd na de opmerking: {previous['note']}")
    return "\n".join(lines)


def main(argv: list[str] | None = None, files: Files | None = None) -> int:
    files = files or Files()
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    commands = parser.add_subparsers(dest="command", required=True)
    show = commands.add_parser("next", help="print the next candidates to review")
    show.add_argument("count", nargs="?", type=int, default=3)
    decide = commands.add_parser("decide", help="save one decision")
    decide.add_argument("id")
    decide.add_argument("decision", choices=DECISIONS)
    decide.add_argument("--seen", required=True, help="the fingerprint of the candidate that the owner saw")
    decide.add_argument("--reason", default="", choices=("", *REASONS))
    decide.add_argument("--note", default="")
    decide.add_argument("--solved", action="append", default=[], help="a solved review note; repeat it for each note")
    apply = commands.add_parser("apply", help="report the decisions, or apply them with --write")
    apply.add_argument("--write", action="store_true")
    args = parser.parse_args(argv)

    candidates, decisions = load(files.candidates), load(files.decisions, {})
    if args.command == "next":
        waiting = open_candidates(candidates, decisions)
        print("\n\n".join(describe(candidate, decisions.get(candidate["id"])) for candidate in waiting[:max(args.count, 0)]))
        print(f"\n{len(waiting)} of {len(candidates)} candidates are open.")
        return 0
    if args.command == "decide":
        candidate = next((c for c in candidates if c["id"] == args.id), None)
        try:
            if candidate is None:
                raise ValueError(f"{args.id}: there is no such candidate")
            decisions[args.id] = make_decision(candidate, args.decision, args.seen, reason=args.reason,
                                               note=args.note, solved=args.solved)
        except ValueError as error:
            print(error, file=sys.stderr)
            return 1
        save(files.decisions, dict(sorted(decisions.items())))
        print(f"{args.id}: {args.decision}")
        return 0

    result = plan(load(files.recipes), candidates, load(files.rejected, []), decisions)
    for title, lines in result["report"].items():
        print(f"{title}: {len(lines)}")
        for line in lines:
            print(f"  {line}")
    errors = validation_errors(result)
    if errors:
        print("Nothing is written, because the result is not valid:", *errors, sep="\n  ", file=sys.stderr)
        return 1
    if args.write:
        for path, value in ((files.recipes, result["recipes"]), (files.candidates, result["candidates"]),
                            (files.rejected, result["rejected"]), (files.decisions, result["decisions"])):
            save(path, value)
    return 1 if result["report"]["problems"] else 0


if __name__ == "__main__":
    sys.exit(main())
