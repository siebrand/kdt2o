#!/usr/bin/env python3
"""Validate public/recipes.json and data/candidates.json against schemas/schema.json.

Besides the JSON Schema, the script checks rules a schema cannot express:
unique recipe IDs and titles, unique component IDs per recipe, component
references that resolve, days only on multi-day recipes, daily variants
within the planned days, NFC-normalized recipe text without HTML, and that an
approved recipe has no open review items and no ingredient flagged as a
sweetener, honey, or sugar, which are not suitable for people with type 2
diabetes.

data/candidates.json has recipes that nobody reviewed yet. The site does not
publish it. It follows the same rules together with public/recipes.json: its
IDs and titles must be new, and it can use the shared components. No candidate
can be approved, and the candidates are sorted by ID. No candidate can be in
data/rejected.json, the list of the recipes that the owner rejected.

The script exits with status 1 when any check fails.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import re
import sys
import unicodedata

from jsonschema import Draft202012Validator


ROOT = Path(__file__).resolve().parent.parent
RECIPES = ROOT / "public" / "recipes.json"
CANDIDATES = ROOT / "data" / "candidates.json"
REJECTED = ROOT / "data" / "rejected.json"
SCHEMA = ROOT / "schemas" / "schema.json"

HTML_TAG = re.compile(r"<\s*/?\s*[a-zA-Z][^>]*>")
# Ingredient flags that a recipe may never have when it is approved.
BLOCKING_FLAGS = {"sweetener", "honey", "sugar"}


def all_ingredients(recipe: dict):
    for ingredient in recipe.get("ingredients", []):
        yield ingredient
        yield from ingredient.get("alternatives", [])
    for component in recipe.get("components", []):
        for ingredient in component.get("ingredients", []):
            yield ingredient
            yield from ingredient.get("alternatives", [])
    for variant in recipe.get("dailyVariants", []):
        for ingredient in variant.get("ingredients", []):
            yield ingredient
            yield from ingredient.get("alternatives", [])


def all_texts(recipe: dict):
    yield recipe.get("title", "")
    yield recipe.get("method", "")
    yield recipe.get("advanceNotice", "")
    yield from recipe.get("notes", [])
    for component in recipe.get("components", []):
        yield component.get("title", "")
        yield component.get("method", "")
        yield component.get("availabilityNote", "")
    for variant in recipe.get("dailyVariants", []):
        yield variant.get("title", "")
        yield variant.get("method", "")
    for ingredient in all_ingredients(recipe):
        yield ingredient.get("raw", "")
        yield ingredient.get("name", "")


def schema_errors(recipes: list, schema: dict) -> list[str]:
    validator = Draft202012Validator(schema)
    errors = []
    for error in sorted(validator.iter_errors(recipes), key=lambda item: list(item.absolute_path)):
        path = list(error.absolute_path)
        label = "/".join(str(part) for part in path) or "(root)"
        if path and isinstance(path[0], int) and path[0] < len(recipes):
            label = f"{recipes[path[0]].get('id', path[0])}: {label}"
        errors.append(f"{label}: {error.message}")
    return errors


def rule_errors(recipes: list) -> list[str]:
    errors = []
    seen_ids: set[str] = set()
    seen_titles: set[str] = set()
    # public/recipes.js copies a component defined in one recipe into every recipe that
    # references it by componentId without defining it.
    defined_shared = {
        component.get("id")
        for recipe in recipes
        for component in recipe.get("components", [])
    }
    for recipe in recipes:
        recipe_id = recipe.get("id", "?")
        if recipe_id in seen_ids:
            errors.append(f"{recipe_id}: duplicate recipe id")
        seen_ids.add(recipe_id)
        title = recipe.get("title", "").casefold()
        if title in seen_titles:
            errors.append(f"{recipe_id}: duplicate title {recipe.get('title')!r}")
        seen_titles.add(title)

        component_ids = [component.get("id") for component in recipe.get("components", [])]
        if len(component_ids) != len(set(component_ids)):
            errors.append(f"{recipe_id}: duplicate component id")
        for ingredient in all_ingredients(recipe):
            reference = ingredient.get("componentId")
            if reference and reference not in component_ids and reference not in defined_shared:
                errors.append(f"{recipe_id}: componentId {reference!r} does not match a component")

        if "days" in recipe and not recipe.get("multiDay"):
            errors.append(f"{recipe_id}: days is set but multiDay is false")
        days = recipe.get("days", 1)
        for variant in recipe.get("dailyVariants", []):
            if variant.get("dayIndex", 0) >= days:
                errors.append(f"{recipe_id}: daily variant {variant.get('title')!r} is outside the {days} planned days")

        if recipe.get("approved"):
            if recipe.get("review"):
                errors.append(f"{recipe_id}: approved, but {len(recipe['review'])} review item(s) are open")
            for ingredient in all_ingredients(recipe):
                blocking = sorted(BLOCKING_FLAGS & set(ingredient.get("flags", [])))
                if blocking:
                    errors.append(f"{recipe_id}: approved, but {ingredient.get('name')!r} is flagged {', '.join(blocking)}")

        for text in [recipe_id, *all_texts(recipe)]:
            if HTML_TAG.search(text or ""):
                errors.append(f"{recipe_id}: recipe text contains HTML: {text[:60]!r}")
            if text and unicodedata.normalize("NFC", text) != text:
                errors.append(f"{recipe_id}: text is not NFC-normalized: {text[:60]!r}")
    return errors


def candidate_errors(recipes: list, candidates: list, schema: dict, rejected: list = ()) -> list[str]:
    known = set(rule_errors(recipes))
    errors = schema_errors(candidates, schema)
    errors += [error for error in rule_errors(recipes + candidates) if error not in known]
    errors += [f"{candidate.get('id', '?')}: a candidate cannot be approved"
               for candidate in candidates if candidate.get("approved") is not False]
    ids = [candidate.get("id", "") for candidate in candidates]
    if ids != sorted(ids):
        errors.append("the candidates are not sorted by id")
    rejected_ids = [entry.get("id", "") for entry in rejected]
    if rejected_ids != sorted(set(rejected_ids)):
        errors.append("the rejected recipes are not unique and sorted by id")
    errors += [f"{entry.get('id', '?')}: a rejected recipe needs {key}"
               for entry in rejected for key in ("id", "title", "reason", "date") if not entry.get(key)]
    errors += [f"{recipe_id}: the recipe is in {REJECTED.relative_to(ROOT)}"
               for recipe_id in ids if recipe_id in rejected_ids]
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("files", nargs="*", help="ignored; pre-commit passes the changed files")
    parser.parse_args()

    recipes = json.loads(RECIPES.read_text(encoding="utf-8"))
    schema = json.loads(SCHEMA.read_text(encoding="utf-8"))
    candidates = json.loads(CANDIDATES.read_text(encoding="utf-8"))
    errors = [f"{RECIPES.relative_to(ROOT)}: {error}" for error in schema_errors(recipes, schema) + rule_errors(recipes)]
    rejected = json.loads(REJECTED.read_text(encoding="utf-8"))
    errors += [f"{CANDIDATES.relative_to(ROOT)}: {error}"
               for error in candidate_errors(recipes, candidates, schema, rejected)]
    for error in errors:
        print(error, file=sys.stderr)
    if errors:
        print(f"{len(errors)} problem(s) found in {len(recipes)} recipes and {len(candidates)} candidates.",
              file=sys.stderr)
        return 1
    print(f"{len(recipes)} recipes and {len(candidates)} candidates are valid.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
