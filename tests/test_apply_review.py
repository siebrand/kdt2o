from __future__ import annotations

import copy
from datetime import date
import json
from pathlib import Path
import sys

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import apply_review  # noqa: E402
import validate_recipes  # noqa: E402


RECIPES = json.loads((ROOT / "public" / "recipes.json").read_text(encoding="utf-8"))
DAY = date(2026, 11, 25)
NOTE = "½ ei; controleer"


def candidate(recipe_id: str, *, notes: tuple[str, ...] = ()) -> dict:
    recipe = copy.deepcopy(next(recipe for recipe in RECIPES if not recipe.get("components")))
    recipe.update(id=recipe_id, title=f"Kandidaat {recipe_id}", approved=False)
    if notes:
        recipe["review"] = [{"type": "scaling", "note": note} for note in notes]
    return recipe


def decide(recipe: dict, decision: str, **values) -> dict:
    return apply_review.make_decision(recipe, decision, apply_review.fingerprint(recipe), today=DAY, **values)


def run(candidates: list[dict], decisions: dict, rejected: list | None = None) -> dict:
    return apply_review.plan(RECIPES, candidates, rejected or [], decisions)


@pytest.fixture
def files(tmp_path: Path) -> apply_review.Files:
    (tmp_path / "public").mkdir()
    (tmp_path / "data").mkdir()
    result = apply_review.Files(tmp_path)
    apply_review.save(result.recipes, RECIPES)
    apply_review.save(result.candidates, [candidate("a-candidate", notes=(NOTE,)), candidate("b-candidate")])
    apply_review.save(result.rejected, [])
    return result


def contents(files: apply_review.Files) -> dict[str, str]:
    return {path.name: path.read_text(encoding="utf-8") for path in vars(files).values() if path.exists()}


def test_approve_moves_the_recipe_and_removes_the_review_items():
    first = candidate("a-candidate", notes=(NOTE,))
    result = run([first, candidate("b-candidate")], {"a-candidate": decide(first, "approve", solved=[NOTE])})
    assert result["recipes"][:-1] == RECIPES
    assert result["recipes"][-1] == {**candidate("a-candidate"), "approved": True}
    assert [c["id"] for c in result["candidates"]] == ["b-candidate"]
    assert result["decisions"] == {}
    assert apply_review.validation_errors(result) == []


def test_approve_needs_every_review_item():
    first = candidate("a-candidate", notes=(NOTE, "tweede"))
    with pytest.raises(ValueError, match="not solved: tweede"):
        decide(first, "approve", solved=[NOTE])
    unsolved = {"decision": "approve", "solved": [], "fingerprint": apply_review.fingerprint(first), "date": "2026-11-25"}
    result = run([first], {"a-candidate": unsolved})
    assert len(result["report"]["problems"]) == 2
    assert result["recipes"] == RECIPES and result["candidates"] == [first]


def test_blocking_flag_stops_the_approval():
    first = candidate("a-candidate")
    first["ingredients"][0]["flags"] = ["honey"]
    result = run([first], {"a-candidate": decide(first, "approve")})
    assert any("flagged honey" in problem for problem in result["report"]["problems"])
    assert result["recipes"] == RECIPES and "a-candidate" in result["decisions"]


def test_reject_removes_and_records():
    first = candidate("a-candidate")
    first["source"] = {"name": "Voorbeeld", "url": "https://example.com/"}
    result = run([first], {"a-candidate": decide(first, "reject", reason="anders", note="te zout")})
    assert result["candidates"] == []
    assert result["rejected"] == [{"id": "a-candidate", "title": first["title"], "reason": "anders",
                                   "date": "2026-11-25", "note": "te zout", "source": "https://example.com/"}]
    assert apply_review.validation_errors(result) == []


def test_rejected_recipe_cannot_come_back():
    first = candidate("a-candidate")
    rejected = [{"id": "a-candidate", "title": "x", "reason": "dubbel", "date": "2026-11-25"}]
    schema = json.loads(validate_recipes.SCHEMA.read_text(encoding="utf-8"))
    assert any("data/rejected.json" in error
               for error in validate_recipes.candidate_errors(RECIPES, [first], schema, rejected))
    assert any("unique and sorted" in error
               for error in validate_recipes.candidate_errors(RECIPES, [], schema, rejected * 2))
    assert any("needs reason" in error for error in validate_recipes.candidate_errors(
        RECIPES, [], schema, [{**rejected[0], "reason": ""}]))


@pytest.mark.parametrize(("decision", "values"), [
    ("reject", {}), ("reject", {"reason": "onbekend"}), ("reject", {"reason": "anders"}), ("change", {}), ("maybe", {}),
])
def test_incomplete_decision_is_refused(decision: str, values: dict):
    with pytest.raises(ValueError):
        decide(candidate("a-candidate"), decision, **values)


def test_change_keeps_the_recipe_and_reopens_it_after_the_change():
    first = candidate("a-candidate")
    decisions = {"a-candidate": decide(first, "change", note="3 eieren")}
    result = run([first], decisions)
    assert result["candidates"] == [first] and result["decisions"] == decisions
    assert result["report"]["changes"] == ["a-candidate: 3 eieren"]
    assert apply_review.open_candidates([first], decisions) == []

    changed = {**first, "method": "Iets anders."}
    assert apply_review.open_candidates([changed], decisions) == [changed]
    assert "3 eieren" in apply_review.describe(changed, decisions["a-candidate"])
    assert run([changed], decisions)["report"]["problems"] == []


@pytest.mark.parametrize(("decision", "values"), [("approve", {}), ("reject", {"reason": "dubbel"})])
def test_old_decision_does_not_apply_to_a_changed_recipe(decision: str, values: dict):
    first = candidate("a-candidate")
    decisions = {"a-candidate": decide(first, decision, **values)}
    changed = {**first, "method": "Iets anders."}
    result = run([changed], decisions)
    assert result["candidates"] == [changed] and result["recipes"] == RECIPES and result["rejected"] == []
    assert "review it again" in result["report"]["problems"][0]
    with pytest.raises(ValueError, match="changed after it was seen"):
        apply_review.make_decision(changed, decision, apply_review.fingerprint(first), **values)


def test_order_of_the_review():
    many, none, skipped = candidate("a", notes=(NOTE,)), candidate("b"), candidate("c")
    decisions = {"c": decide(skipped, "skip")}
    assert [c["id"] for c in apply_review.open_candidates([many, none, skipped], decisions)] == ["b", "a", "c"]


def test_command_line_round_trip(files: apply_review.Files, capsys: pytest.CaptureFixture):
    assert apply_review.main(["next", "2"], files) == 0
    output = capsys.readouterr().out
    assert output.index("b-candidate") < output.index("a-candidate") and NOTE in output
    seen = apply_review.fingerprint(candidate("b-candidate"))
    assert apply_review.main(["decide", "b-candidate", "approve", "--seen", "wrong"], files) == 1
    assert apply_review.main(["decide", "unknown", "approve", "--seen", seen], files) == 1
    assert not files.decisions.exists()
    assert apply_review.main(["decide", "b-candidate", "approve", "--seen", seen], files) == 0

    before = contents(files)
    assert apply_review.main(["apply"], files) == 0
    assert contents(files) == before
    assert apply_review.main(["apply", "--write"], files) == 0
    assert [recipe["id"] for recipe in apply_review.load(files.recipes)][-1] == "b-candidate"
    assert [recipe["id"] for recipe in apply_review.load(files.candidates)] == ["a-candidate"]
    written = contents(files)
    assert apply_review.main(["apply", "--write"], files) == 0
    assert contents(files) == written


def test_invalid_result_writes_nothing(files: apply_review.Files):
    broken = {**candidate("a-candidate"), "portions": 0}
    apply_review.save(files.candidates, [broken])
    apply_review.save(files.decisions, {"a-candidate": decide(broken, "approve")})
    before = contents(files)
    assert apply_review.main(["apply", "--write"], files) == 1
    assert contents(files) == before
