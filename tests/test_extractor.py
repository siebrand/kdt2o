import json
import tempfile
import unittest
from pathlib import Path
from scripts.extract_recipes import parse_text_recipe, infer_portions, normalize_ingredient

class ExtractorTests(unittest.TestCase):
    def test_portion_inference(self):
        self.assertEqual(infer_portions("Voor 6 personen"), 6)
        self.assertEqual(infer_portions("Voor 2 personen"), 2)

    def test_text_recipe(self):
        text = "Titel\\n\\nIngrediënten\\n\\n    2 appels\\n    1 tl kaneel\\n\\nVoor 2 personen\\n\\nBereidingswijze\\n\\nSnijd alles."
        recipe = parse_text_recipe(Path("voorbeeld.txt"), text, "ontbijt")
        self.assertEqual(recipe["portions"], 2)
        self.assertEqual(len(recipe["ingredients"]), 2)

    def test_normalize_ingredient(self):
        self.assertEqual(normalize_ingredient("  2  appels "), "appels")
