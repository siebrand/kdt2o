#!/usr/bin/env python3
"""Extract a stable recipe model from the repository's PDF and TXT sources."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

DAYS = ["Maandag", "Dinsdag", "Woensdag", "Donderdag", "Vrijdag", "Zaterdag", "Zondag"]


def infer_portions(text: str) -> int:
    match = re.search(r"voor\s+(?:circa\s+)?(\d+)\s+personen", text, re.IGNORECASE)
    return int(match.group(1)) if match else 2


def normalize_ingredient(value: str) -> str:
    value = re.sub(r"^\s*[-•]\s*", "", value).strip().lower()
    value = re.sub(r"^\d+(?:[,.]\d+)?\s*(?:gram|g|ml|cl|kg|el|tl|stuks?|x)?\s+", "", value)
    return re.sub(r"\s+", " ", value).strip(" .")


def parse_ingredient(line: str) -> dict:
    raw = re.sub(r"^\s*[-•]\s*", "", line).strip()
    match = re.match(r"^(?P<amount>\d+(?:[,.]\d+)?(?:/\d+)?)\s*(?P<unit>gram|g|kg|ml|cl|liter|l|el|tl|stuks?|stuk|teentje|eetlepels?|theelepels?)?\s*(?P<name>.+)$", raw, re.IGNORECASE)
    if not match:
        return {"raw": raw, "amount": None, "unit": "", "name": raw, "key": normalize_ingredient(raw)}
    amount = match.group("amount").replace(",", ".")
    return {
        "raw": raw,
        "amount": float(amount) if "/" not in amount else amount,
        "unit": (match.group("unit") or "").lower(),
        "name": match.group("name").strip(),
        "key": normalize_ingredient(raw),
    }


def parse_text_recipe(path: Path, text: str, category: str) -> dict:
    lines = [line.strip() for line in text.replace("\r", "").splitlines()]
    nonempty = [line for line in lines if line]
    title = nonempty[0] if nonempty else path.stem.replace("-", " ").title()
    portions = infer_portions(text)
    start = next((i for i, line in enumerate(lines) if line.lower() == "ingrediënten"), None)
    ingredients = []
    if start is not None:
        for line in lines[start + 1:]:
            if not line:
                if ingredients:
                    break
                continue
            if re.match(r"^(bereiding|bereidingswijze|voor\s+\d+\s+personen)", line, re.IGNORECASE):
                break
            if len(line) < 120:
                ingredients.append(parse_ingredient(line))
    method_index = next((i for i, line in enumerate(lines) if line.lower().startswith(("bereidingswijze", "bereiding:"))), None)
    method = " ".join(line for line in (lines[method_index + 1:] if method_index is not None else []) if line)
    return {
        "id": path.stem,
        "title": title,
        "category": category,
        "portions": portions,
        "multiDay": category in ("ontbijt", "lunch") and portions >= 6,
        "ingredients": ingredients,
        "method": method,
        "source": str(path).replace("\\", "/"),
    }


def pdf_text(path: Path) -> str:
    try:
        from pypdf import PdfReader
        return "\n".join(page.extract_text() or "" for page in PdfReader(str(path)).pages)
    except Exception:
        return ""


def extract(source_dir: Path) -> list[dict]:
    recipes = []
    for path in sorted(source_dir.rglob("*")):
        if path.suffix.lower() not in {".pdf", ".txt"}:
            continue
        category = next((value for value in ("ontbijt", "lunch", "diner") if value in path.parts[-2]), "diner")
        text = path.read_text(encoding="utf-8") if path.suffix.lower() == ".txt" else pdf_text(path)
        recipes.append(parse_text_recipe(path, text, category))
    return recipes


def main() -> int:
    if len(sys.argv) != 3:
        print("usage: extract_recipes.py SOURCE_DIR OUTPUT_JSON", file=sys.stderr)
        return 2
    recipes = extract(Path(sys.argv[1]))
    output = Path(sys.argv[2])
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(recipes, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Extracted {len(recipes)} recipes to {output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
