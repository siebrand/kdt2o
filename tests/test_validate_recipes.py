from __future__ import annotations

import copy
import json
from pathlib import Path
import sys

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import validate_recipes  # noqa: E402


RECIPES = json.loads((ROOT / "public" / "recipes.json").read_text(encoding="utf-8"))
CANDIDATES = json.loads((ROOT / "data" / "candidates.json").read_text(encoding="utf-8"))
SCHEMA = json.loads((ROOT / "schemas" / "schema.json").read_text(encoding="utf-8"))


def errors_for(recipe: dict) -> list[str]:
    recipes = [recipe]
    return validate_recipes.schema_errors(recipes, SCHEMA) + validate_recipes.rule_errors(recipes)


def approved_recipe() -> dict:
    return copy.deepcopy(next(recipe for recipe in RECIPES if recipe["approved"]))


def candidate(recipe_id: str) -> dict:
    recipe = next(recipe for recipe in RECIPES if not recipe.get("components"))
    return {**copy.deepcopy(recipe), "id": recipe_id, "title": f"Kandidaat {recipe_id}", "approved": False}


def test_current_data_is_valid():
    assert validate_recipes.schema_errors(RECIPES, SCHEMA) + validate_recipes.rule_errors(RECIPES) == []


def test_current_candidates_are_valid_and_not_published():
    assert validate_recipes.candidate_errors(RECIPES, CANDIDATES, SCHEMA) == []
    assert not list((ROOT / "public").rglob("candidates*"))
    copied = [line for line in (ROOT / "Dockerfile").read_text(encoding="utf-8").splitlines() if line.startswith("COPY")]
    assert not any("data" in line.split() or "." in line.split() for line in copied)


def test_candidate_errors():
    first, second = candidate("a-candidate"), candidate("b-candidate")
    check = lambda candidates: validate_recipes.candidate_errors(RECIPES, candidates, SCHEMA)  # noqa: E731
    assert check([first, second]) == []
    assert any("not sorted" in error for error in check([second, first]))
    assert any("cannot be approved" in error for error in check([{**first, "approved": True}]))
    assert any("duplicate recipe id" in error for error in check([{**first, "id": RECIPES[0]["id"]}]))
    assert any("duplicate title" in error for error in check([{**first, "title": RECIPES[0]["title"]}]))
    unresolved = copy.deepcopy(first)
    unresolved["ingredients"][0]["componentId"] = "no-such-component"
    assert any("does not match a component" in error for error in check([unresolved]))
    assert any("portions" in error for error in check([{**first, "portions": 0}]))


def test_shared_components_of_the_recipes_are_known_to_candidates():
    shared = candidate("a-candidate")
    shared["ingredients"][0]["componentId"] = "lijnzaadcrackers"
    assert validate_recipes.candidate_errors(RECIPES, [shared], SCHEMA) == []


@pytest.mark.parametrize("flag", ["sweetener", "honey", "sugar"])
def test_blocking_flag_prevents_approval(flag: str):
    recipe = approved_recipe()
    recipe["ingredients"][0]["flags"] = [flag]
    assert any(f"flagged {flag}" in error for error in errors_for(recipe))
    recipe["approved"] = False
    assert errors_for(recipe) == []


def test_other_flags_allow_approval():
    recipe = approved_recipe()
    recipe["ingredients"][0]["flags"] = ["alcohol", "starch"]
    assert errors_for(recipe) == []


def test_open_review_prevents_approval():
    recipe = approved_recipe()
    recipe["review"] = [{"type": "scaling", "note": "4 eieren voor 4 porties: 2 eieren voor 2 porties; controleer"}]
    assert any("review item(s) are open" in error for error in errors_for(recipe))
    recipe["approved"] = False
    assert errors_for(recipe) == []


def test_unknown_flag_and_source_without_https_are_rejected():
    recipe = approved_recipe()
    recipe["ingredients"][0]["flags"] = ["spicy"]
    recipe["source"] = {"name": "Voorbeeld", "url": "http://example.com/"}
    errors = errors_for(recipe)
    assert any("flags" in error for error in errors)
    assert any("source" in error for error in errors)


def test_nutrition_per_portion_is_optional_and_checked():
    recipe = approved_recipe()
    recipe["nutrition"] = {"calories": 337.5, "carbohydrates": 4, "protein": 20.1, "fat": 25, "fiber": 3.2,
                           "note": "Per portie exclusief brood"}
    assert errors_for(recipe) == []
    recipe["nutrition"] = {"calories": -1, "salt": 1}
    errors = errors_for(recipe)
    assert any("nutrition" in error for error in errors)
