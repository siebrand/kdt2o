import unittest
from pathlib import Path

from scripts.extract_recipes import infer_portions, normalize_ingredient, parse_text_recipe


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


if __name__ == "__main__":
    unittest.main()
