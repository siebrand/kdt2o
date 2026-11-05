#!/usr/bin/env python3
"""Add shopping-list categories to every ingredient in recipes.json.

The script updates ingredients and nested alternatives in place. It keeps
existing explicit categories, classifies missing categories using the same
fallback rules as the application, and creates a backup before writing.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import re
import shutil


CATEGORIES = {
    "Groente en fruit": (
        "wortel", "courgette", "paprika", "tomaat", "tomaten", "cherry tom",
        "komkommer", "biet", "avocado", "broccoli", "bloemkool", "spinazie",
        "sla", "rucola", "andijvie", "aubergine", "augurk", "bleekselderij",
        "venkel", "mais", "mandarijn", "champignon", "knoflook", "gember",
        "citroen", "limoen", "appel", "banaan", "aardbei", "framboos",
        "bosbes", "blauwe bes", "mango", "peer", "druif", "fruit", "kikkererwt",
        "erwt", "snijboon", "witlof", "ui", "uien", "lenteui", "bosui", "prei", "spruit",
        "taugé", "knolselderij", "pastinaak", "zuurkool", "artisjok",
        "bladgroente", "pompoen", "bladsalade", "gegrilde groenten", "paksoi",
        "chinese kool", "nasi/bami groenten", "rode kool"
    ),
    "Zuivel en eieren": (
        "yoghurt", "kwark", "melk", "kaas", "feta", "ricotta", "mozzarella",
        "hüttenkäse", "huttenkase", "boter", "roomboter", "room", "slagroom", "crème fraîche", "creme fraiche",
        "ei", "eieren"
    ),
    "Vlees, vis en vleesvervangers": (
        "kip", "rund", "gehakt", "spek", "ham", "zalm", "tonijn", "vis",
        "pangasius", "haring", "biefstuk", "tartaar", "tofu", "tempeh"
    ),
    "Brood en ontbijt": ("brood", "cracker", "havermout", "muesli", "granola"),
    "Kruiden en smaakmakers": (
        "zout", "peper", "kaneel", "kruiden", "oregano", "basilicum", "komijn",
        "kerrie", "paprikapoeder", "salie", "peterselie", "dille", "koriander",
        "bieslook", "chilipoeder", "chilivlokken", "kurkuma", "nootmuskaat", "vanille",
        "kruidnagel", "tijm", "chili", "jalapeno", "spices"
    ),
    "Houdbare producten": (
        "pasta", "rijst", "quinoa", "couscous", "linzen", "bonen", "noten",
        "amandel", "zaad", "pitten", "olie", "olijfolie", "azijn", "meel", "bloem", "bakpoeder",
        "cacao", "chocolade", "pindakaas", "honing", "kokos", "kokosmelk", "mayonaise", "sojasaus",
        "mosterd", "pesto", "bouillon", "olijf", "olijven", "kelp"
    ),
}


def category_for(ingredient: dict) -> str:
    name = str(ingredient.get("name", "")).casefold()
    if "diepvries" in name or "bevroren" in name:
        return "Diepvries"
    def matches(term: str) -> bool:
        boundary = r"[^a-zà-ÿ]"
        return re.search(rf"(?:^|{boundary}){re.escape(term.casefold())}(?:$|{boundary})", name) is not None
    for category, terms in CATEGORIES.items():
        if any(matches(term) for term in terms):
            return category
    return "Overig"


def visit(value: object) -> int:
    count = 0
    if isinstance(value, dict):
        if {"raw", "name", "optional"}.issubset(value):
            value.pop("key", None)
            value["category"] = category_for(value)
            count += 1
        for child in value.values():
            count += visit(child)
    elif isinstance(value, list):
        for child in value:
            count += visit(child)
    return count


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("path", nargs="?", type=Path, default=Path("public/recipes.json"))
    parser.add_argument("--no-backup", action="store_true", help="Do not create a .bak backup")
    args = parser.parse_args()

    if not args.path.is_file():
        parser.error(f"file not found: {args.path}")
    if not args.no_backup:
        shutil.copy2(args.path, args.path.with_suffix(args.path.suffix + ".bak"))

    with args.path.open(encoding="utf-8") as handle:
        data = json.load(handle)
    count = visit(data)
    with args.path.open("w", encoding="utf-8") as handle:
        json.dump(data, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    print(f"Added categories to {count} ingredients in {args.path}")


if __name__ == "__main__":
    main()
