#!/usr/bin/env python3
"""Generate deterministic recipe infographic SVGs from public recipe data."""

from __future__ import annotations

import html
import json
import re
import sys
import unicodedata
from pathlib import Path


STYLE_VERSION = "recipe-infographic-v1"
EXAMPLE_ASSET = "lijnzaadcrackers-en-huttenkase-en-avocado.svg"


def slugify(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-z0-9]+", "-", normalized.lower()).strip("-")
    return slug or "recept"


def escape(value: object) -> str:
    return html.escape(str(value), quote=True)


def amount_label(ingredient: dict) -> str:
    amount = ingredient.get("amount")
    unit = ingredient.get("unit") or ""
    name = ingredient.get("name") or ingredient.get("raw") or "ingredient"
    prefix = "" if amount is None else f"{amount:g} " if isinstance(amount, float) else f"{amount} "
    return f"{prefix}{unit + ' ' if unit else ''}{name}".strip()


def method_steps(method: str) -> list[str]:
    text = re.sub(r"\s+", " ", method or "").strip()
    steps = [part.strip() for part in re.findall(r"[^.!?]+[.!?]+|[^.!?]+$", text) if part.strip()]
    return steps[:5] or ["Volg de bereidingswijze uit het recept."]


def wrap_svg_text(value: str, max_length: int = 38, max_lines: int = 2) -> list[str]:
    words = str(value or "").split()
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if current and len(candidate) > max_length:
            lines.append(current)
            current = word
        else:
            current = candidate
    if current:
        lines.append(current)
    if len(lines) > max_lines:
        lines = lines[:max_lines]
        lines[-1] = lines[-1][: max_length - 1].rstrip() + "…"
    return lines


def ingredient_markup(value: str, index: int) -> str:
    y = 488 + index * 38
    tspans = "".join(
        f'<tspan x="128" dy="{0 if line_index == 0 else 21}">{escape(line)}</tspan>'
        for line_index, line in enumerate(wrap_svg_text(value))
    )
    return f'    <text x="128" y="{y}">{tspans}</text>'


def svg_for(recipe: dict) -> str:
    title = recipe.get("title", "Recept")
    category = str(recipe.get("category", "recept")).upper()
    portions = recipe.get("portions") or 2
    ingredients = [amount_label(item) for item in recipe.get("ingredients", [])][:8]
    steps = method_steps(recipe.get("method", ""))
    safe_title = escape(title)
    safe_category = escape(category)
    ingredient_lines = "\n".join(
        ingredient_markup(value, index) for index, value in enumerate(ingredients)
    )
    ingredient_dots = "".join(
        f'<circle cx="118" cy="{480 + index * 38}" r="5"/>' for index in range(len(ingredients))
    )
    step_markup = []
    for index, step in enumerate(steps):
        y = 493 + index * 92
        label = escape(step[:92])
        step_markup.append(
            f'''    <circle cx="735" cy="{y}" r="34" fill="#e9795d"/>
    <text x="735" y="{y + 12}" text-anchor="middle" fill="#fff" font-size="28" font-weight="800">{index + 1}</text>
    <text x="795" y="{y - 7}" fill="#174c45" font-size="23" font-weight="700">Stap {index + 1}</text>
    <text x="795" y="{y + 27}" fill="#365f57" font-size="19">{label}</text>'''
        )
    steps_markup = "\n".join(step_markup)
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900" role="img" aria-labelledby="title desc">
  <title id="title">{safe_title}</title>
  <desc id="desc">Infographic met ingrediënten en bereidingsstappen voor {safe_title}.</desc>
  <rect width="1600" height="900" rx="36" fill="#fff9f0"/>
  <circle cx="1470" cy="90" r="180" fill="#e9f0dc"/>
  <circle cx="80" cy="830" r="210" fill="#f7ded4"/>
  <g fill="none" stroke="#174c45" stroke-width="7" stroke-linecap="round" opacity=".8">
    <path d="M1390 170c55-42 111-43 148-14-36 3-72 23-98 55"/>
    <path d="M1420 208c-4-38 9-70 37-91"/>
  </g>
  <text x="92" y="105" fill="#e9795d" font-family="Arial, sans-serif" font-size="24" font-weight="700" letter-spacing="3">{safe_category} · {portions} PERSONEN</text>
  <text x="88" y="182" fill="#174c45" font-family="Arial, sans-serif" font-size="54" font-weight="800">{safe_title[:30]}</text>
  <rect x="90" y="280" width="185" height="52" rx="26" fill="#174c45"/>
  <text x="182" y="315" text-anchor="middle" fill="#fff9f0" font-family="Arial, sans-serif" font-size="23" font-weight="700">RECEPT</text>
  <rect x="88" y="382" width="535" height="410" rx="28" fill="#ffffff" stroke="#d6e3d4" stroke-width="3"/>
  <text x="125" y="437" fill="#174c45" font-family="Arial, sans-serif" font-size="30" font-weight="800">INGREDIËNTEN</text>
  <g fill="#365f57" font-family="Arial, sans-serif" font-size="22">
{ingredient_lines}
  </g>
  <g fill="#e9795d">{ingredient_dots}</g>
  <text x="700" y="405" fill="#174c45" font-family="Arial, sans-serif" font-size="30" font-weight="800">ZO MAAK JE HET</text>
  <g font-family="Arial, sans-serif">
{steps_markup}
  </g>
  <g transform="translate(1280 210) scale(.65)">
    <ellipse cx="100" cy="120" rx="250" ry="55" fill="#d6e3d4"/>
    <path d="M-70 42c45-102 185-125 282-55 46 33 64 76 49 113-35 83-244 78-331 18-22-15-17-45 0-76z" fill="#d8a261" stroke="#174c45" stroke-width="7"/>
    <circle cx="22" cy="62" r="20" fill="#d9584d" stroke="#174c45" stroke-width="6"/>
    <circle cx="165" cy="67" r="18" fill="#83aa65" stroke="#174c45" stroke-width="6"/>
  </g>
</svg>
'''


def main() -> int:
    if len(sys.argv) != 3:
        print("Usage: generate_infographics.py RECIPES_JSON OUTPUT_DIR", file=sys.stderr)
        return 2
    recipes_path = Path(sys.argv[1])
    output_dir = Path(sys.argv[2])
    recipes = json.loads(recipes_path.read_text(encoding="utf-8"))
    output_dir.mkdir(parents=True, exist_ok=True)
    assets = []
    for recipe in recipes:
        filename = f"{slugify(recipe.get('title', recipe.get('id', 'recept')))}.svg"
        target = output_dir / filename
        if filename != EXAMPLE_ASSET:
            target.write_text(svg_for(recipe), encoding="utf-8")
        assets.append({
            "recipeId": recipe.get("id"),
            "path": f"/infographics/{filename}",
            "alt": f"Infographic van {recipe.get('title', 'het recept')}",
            "status": "voorbeeld" if filename == EXAMPLE_ASSET else "gegenereerd",
        })
    (output_dir / "manifest.json").write_text(
        json.dumps({"styleVersion": STYLE_VERSION, "assets": assets}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Generated {len(assets)} recipe infographics in {output_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
