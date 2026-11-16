#!/usr/bin/env python3
"""Validate public/recipes.json against schemas/schema.json.

Besides the JSON Schema, the script checks rules a schema cannot express:
unique recipe IDs and titles, unique component IDs per recipe, component
references that resolve, days only on multi-day recipes, daily variants
within the planned days, and NFC-normalized recipe text without HTML. It
exits with status 1 when any check fails.
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
SCHEMA = ROOT / "schemas" / "schema.json"

HTML_TAG = re.compile(r"<\s*/?\s*[a-zA-Z][^>]*>")


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
    # app.js copies a component defined in one recipe into every recipe that
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

        for text in [recipe_id, *all_texts(recipe)]:
            if HTML_TAG.search(text or ""):
                errors.append(f"{recipe_id}: recipe text contains HTML: {text[:60]!r}")
            if text and unicodedata.normalize("NFC", text) != text:
                errors.append(f"{recipe_id}: text is not NFC-normalized: {text[:60]!r}")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("files", nargs="*", help="ignored; pre-commit passes the changed files")
    parser.parse_args()

    recipes = json.loads(RECIPES.read_text(encoding="utf-8"))
    schema = json.loads(SCHEMA.read_text(encoding="utf-8"))
    errors = schema_errors(recipes, schema) + rule_errors(recipes)
    for error in errors:
        print(f"{RECIPES.relative_to(ROOT)}: {error}", file=sys.stderr)
    if errors:
        print(f"{len(errors)} problem(s) found in {len(recipes)} recipes.", file=sys.stderr)
        return 1
    print(f"{len(recipes)} recipes are valid.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
