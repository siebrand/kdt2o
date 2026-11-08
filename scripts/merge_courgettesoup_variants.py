#!/usr/bin/env python3
"""Merge the three courgette soup recipes into one three-day recipe."""

from copy import deepcopy
import json
from pathlib import Path

path = Path("public/recipes.json")
recipes = json.loads(path.read_text(encoding="utf-8"))

ids = [
    "courgette-soep-en-sla-met-bietjes-geitenkaas-en-walnoten",
    "courgette-soep-met-lijnzaadcrackers-en-pindakaas",
    "courgettesoep-met-zomerse-salade",
]
by_id = {recipe["id"]: recipe for recipe in recipes}
missing = [recipe_id for recipe_id in ids if recipe_id not in by_id]
if missing:
    raise SystemExit(f"Missing recipes: {', '.join(missing)}")

bietjes_recipe = by_id[ids[0]]
crackers_recipe = by_id[ids[1]]
salade_recipe = by_id[ids[2]]

variant_names = {
    "biet": "biet",
    "geitenkaas": "geitenkaas",
    "walnoten": "walnoten",
}
base_ingredients = [
    deepcopy(ingredient)
    for ingredient in bietjes_recipe["ingredients"]
    if ingredient["name"] not in variant_names
]

def select(recipe, names):
    return [
        deepcopy(ingredient)
        for ingredient in recipe["ingredients"]
        if ingredient["name"] in names
    ]

merged = {
    "id": "courgettesoep-3-dagen",
    "title": "Courgettesoep, drie variaties",
    "category": "lunch",
    "portions": bietjes_recipe.get("portions", 6),
    "days": 3,
    "multiDay": True,
    "ingredients": base_ingredients,
    "dailyVariants": [
        {
            "dayIndex": 0,
            "title": "Met bietjes, geitenkaas en walnoten",
            "ingredients": select(bietjes_recipe, {"biet", "geitenkaas", "walnoten"}),
            "method": "Snijd de bietjes en serveer ze bij de soep met de geitenkaas en walnoten."
        },
        {
            "dayIndex": 1,
            "title": "Met lijnzaadcrackers en pindakaas",
            "ingredients": select(crackers_recipe, {"lijnzaadcracker(s)", "pindakaas (per persoon)"}),
            "method": "Serveer de soep met een lijnzaadcracker met pindakaas."
        },
        {
            "dayIndex": 2,
            "title": "Met zomerse salade en boerenkaas",
            "ingredients": select(
                salade_recipe,
                {"(gemengde) groene bladsla", "komkommer", "cherrytomaten", "olijven", "lijnzaadcracker", "boerenkaas"},
            ),
            "method": "Maak een salade van de bladsla, komkommer, cherrytomaten en olijven. Serveer de soep met de salade en een lijnzaadcracker met boerenkaas."
        },
    ],
    "method": (
        "Snijd de courgettes, uien en knoflook in grove stukken. Verhit de roomboter in een soeppan "
        "en bak de uien en knoflook glazig. Voeg de courgette en salie toe en bak kort mee. "
        "Voeg de bouillon en het water toe tot de groenten onderstaan en laat de soep zacht koken "
        "tot de groenten gaar zijn. Voeg de norivellen toe en pureer de soep. Roer de slagroom of "
        "crème fraîche erdoor, breng op smaak met peper, zout en citroensap en voeg de sojabonen toe."
    ),
    "harmonizerVersion": "1",
    "harmonized": False,
}

remaining = [recipe for recipe in recipes if recipe["id"] not in ids]
insert_at = next(index for index, recipe in enumerate(recipes) if recipe["id"] == ids[0])
remaining.insert(sum(recipe["id"] not in ids for recipe in recipes[:insert_at]), merged)
path.write_text(json.dumps(remaining, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"Merged {len(ids)} recipes into {merged['id']}")
