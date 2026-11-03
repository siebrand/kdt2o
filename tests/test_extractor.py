import tempfile
import unittest
from pathlib import Path

from scripts.extract_recipes import (
    extract,
    infer_portions,
    normalize_ingredient,
    parse_text_recipe,
)


class ExtractorTests(unittest.TestCase):
    def test_portion_inference(self):
        self.assertEqual(infer_portions("Voor 6 personen"), 6)
        self.assertEqual(infer_portions("Voor 2 personen"), 2)

    def test_text_recipe(self):
        text = """Titel

Ingrediënten

    2 appels
    1 tl kaneel

Voor 2 personen

Bereidingswijze

Snijd alles."""
        recipe = parse_text_recipe(Path("voorbeeld.txt"), text, "ontbijt")
        self.assertEqual(recipe["portions"], 2)
        self.assertEqual(len(recipe["ingredients"]), 2)

    def test_normalize_ingredient(self):
        self.assertEqual(normalize_ingredient("  2  appels "), "appels")

    def test_source_hash_cache_reuses_unchanged_recipe(self):
        text = """Cache recept

Ingrediënten

    2 appels

Voor 2 personen

Bereidingswijze

Snijd alles."""
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "ontbijt"
            source.mkdir()
            recipe_file = source / "cache.txt"
            recipe_file.write_text(text, encoding="utf-8")
            first = extract(Path(directory))
            second = extract(Path(directory), {first[0]["id"]: first[0]})
            self.assertEqual(first, second)
            self.assertTrue(first[0]["sourceHash"])
            self.assertFalse(first[0]["harmonized"])


if __name__ == "__main__":
    unittest.main()
