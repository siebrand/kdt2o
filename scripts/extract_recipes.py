#!/usr/bin/env python3
"""Extract and optionally harmonize recipe sources into a cached JSON model."""

from __future__ import annotations

import hashlib
import json
import os
import re
import shlex
import subprocess
import sys
from pathlib import Path

HARMONIZER_VERSION = "1"
CATEGORIES = ("ontbijt", "lunch", "diner")


def infer_portions(text: str) -> int:
    match = re.search(r"voor\s+(?:circa\s+)?(\d+)\s+personen", text, re.IGNORECASE)
    return int(match.group(1)) if match else 2


def normalize_ingredient(value: str) -> str:
    value = re.sub(r"^\s*[-•]\s*", "", value).strip().lower()
    value = re.sub(r"^\d+(?:[,.]\d+)?\s*(?:gram|g|ml|cl|kg|el|tl|stuks?|x)?\s+", "", value)
    return re.sub(r"\s+", " ", value).strip(" .")


def parse_ingredient(line: str) -> dict:
    raw = re.sub(r"^\s*[-•]\s*", "", line).strip()
    pattern = (
        r"^(?P<amount>\d+(?:[,.]\d+)?(?:/\d+)?)\s*"
        r"(?P<unit>gram|g|kg|ml|cl|liter|l|el|tl|stuks?|stuk|teentje|"
        r"eetlepels?|theelepels?)?\s*(?P<name>.+)$"
    )
    match = re.match(pattern, raw, re.IGNORECASE)
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


def title_from_filename(path: Path) -> str:
    title = re.sub(r"[-_]+", " ", path.stem).strip()
    return title[:1].upper() + title[1:]


def parse_text_recipe(path: Path, text: str, category: str) -> dict:
    lines = [line.strip() for line in text.replace("\r", "").splitlines()]
    nonempty = [line for line in lines if line]
    title = nonempty[0] if nonempty else title_from_filename(path)
    if (
        len(title) > 100
        or "ingrediënten" in title.lower()
        or "bereidingswijze" in title.lower()
        or re.search(r"voor\s+\d+\s+personen", title, re.IGNORECASE)
    ):
        title = title_from_filename(path)
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
    method_index = next(
        (i for i, line in enumerate(lines)
         if line.lower().startswith(("bereidingswijze", "bereiding:"))),
        None,
    )
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


def source_hash(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def source_category(path: Path) -> str:
    return next((value for value in CATEGORIES if value in path.parts[-2]), "diner")


def extract_one(path: Path) -> dict:
    category = source_category(path)
    text = path.read_text(encoding="utf-8") if path.suffix.lower() == ".txt" else pdf_text(path)
    recipe = parse_text_recipe(path, text, category)
    recipe["sourceHash"] = source_hash(path)
    recipe["harmonizerVersion"] = HARMONIZER_VERSION
    recipe["harmonized"] = False
    return recipe


def harmonize_with_llm(recipe: dict) -> dict:
    command = os.environ.get("RECIPE_LLM_COMMAND", "").strip()
    if not command:
        return recipe
    try:
        result = subprocess.run(
            shlex.split(command),
            input=json.dumps(recipe, ensure_ascii=False),
            text=True,
            capture_output=True,
            check=True,
            timeout=120,
        )
        improved = json.loads(result.stdout)
        if not isinstance(improved, dict) or improved.get("id") != recipe["id"]:
            raise ValueError("LLM output must be an object with the same recipe id")
        merged = {**recipe, **improved}
        merged["sourceHash"] = recipe["sourceHash"]
        merged["harmonizerVersion"] = HARMONIZER_VERSION
        merged["harmonized"] = True
        return merged
    except (OSError, ValueError, json.JSONDecodeError, subprocess.SubprocessError) as error:
        print(f"LLM harmonization skipped for {recipe['id']}: {error}", file=sys.stderr)
        return recipe


def extract(source_dir: Path, previous: dict[str, dict] | None = None) -> list[dict]:
    previous = previous or {}
    recipes = []
    for path in sorted(source_dir.rglob("*")):
        if path.suffix.lower() not in {".pdf", ".txt"}:
            continue
        current_hash = source_hash(path)
        cached = previous.get(path.stem)
        cache_is_valid = (
            cached
            and cached.get("sourceHash") == current_hash
            and cached.get("harmonizerVersion") == HARMONIZER_VERSION
            and (not os.environ.get("RECIPE_LLM_COMMAND", "").strip() or cached.get("harmonized"))
        )
        if cache_is_valid:
            recipes.append(cached)
            continue
        recipes.append(harmonize_with_llm(extract_one(path)))
    return recipes


def load_previous(output: Path) -> dict[str, dict]:
    if not output.exists():
        return {}
    try:
        data = json.loads(output.read_text(encoding="utf-8"))
        return {item["id"]: item for item in data if isinstance(item, dict) and item.get("id")}
    except (OSError, json.JSONDecodeError, TypeError):
        return {}


def main() -> int:
    if len(sys.argv) != 3:
        print("usage: extract_recipes.py SOURCE_DIR OUTPUT_JSON", file=sys.stderr)
        return 2
    source_dir, output = Path(sys.argv[1]), Path(sys.argv[2])
    output.parent.mkdir(parents=True, exist_ok=True)
    cache_file = Path(os.environ.get("RECIPE_CACHE_FILE", str(output)))
    cache_file.parent.mkdir(parents=True, exist_ok=True)
    recipes = extract(source_dir, load_previous(cache_file))
    serialized = json.dumps(recipes, ensure_ascii=False, indent=2) + "\n"
    output.write_text(serialized, encoding="utf-8")
    if cache_file != output:
        cache_file.write_text(serialized, encoding="utf-8")
    harmonized = sum(1 for recipe in recipes if recipe.get("harmonized"))
    print(f"Extracted {len(recipes)} recipes; harmonized {harmonized}; wrote {output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
