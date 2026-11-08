#!/usr/bin/env python3
"""Append the standard freezing tip to every soup recipe."""

import json
from pathlib import Path

path = Path("public/recipes.json")
recipes = json.loads(path.read_text(encoding="utf-8"))
tip = "Tip: Vries overgebleven soep in om er later nog eens van te genieten."
changed = 0

for recipe in recipes:
    title = str(recipe.get("title", "")).lower()
    method = str(recipe.get("method", ""))
    if "soep" not in title and "soep" not in method.lower():
        continue
    if tip in method:
        continue
    recipe["method"] = (method.rstrip() + " " + tip).strip()
    changed += 1

path.write_text(json.dumps(recipes, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"Added freezing tip to {changed} soup recipes")
