#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const recipePath = path.resolve(
  process.argv[2] || path.join(__dirname, "..", "public", "recipes.json")
);
const program = process.argv[3] || "Keer Diabetes2 Om";

const originalText = fs.readFileSync(recipePath, "utf8");
const recipes = JSON.parse(originalText);

if (!Array.isArray(recipes)) {
  throw new Error(`${recipePath} must contain a recipe array`);
}

const missingProgramIndexes = new Set();
recipes.forEach((recipe, index) => {
  if (!Array.isArray(recipe.programs) || !recipe.programs.includes(program)) {
    missingProgramIndexes.add(index);
  }
});

if (missingProgramIndexes.size === 0) {
  console.log(`All ${recipes.length} recipes already contain program: ${program}`);
  process.exit(0);
}

let recipeIndex = 0;
const updatedText = originalText.replace(
  /^(\s*)"multiDay": (false|true),$/gm,
  (line, indent) => {
    const shouldUpdate = missingProgramIndexes.has(recipeIndex);
    recipeIndex += 1;

    if (!shouldUpdate) {
      return line;
    }

    return `${line}
${indent}"programs": [
${indent}  ${JSON.stringify(program)}
${indent}],`;
  }
);

if (recipeIndex !== recipes.length) {
  throw new Error(
    `Expected ${recipes.length} recipe multiDay fields, found ${recipeIndex}`
  );
}

const updatedRecipes = JSON.parse(updatedText);
if (
  updatedRecipes.some(
    (recipe) =>
      !Array.isArray(recipe.programs) || !recipe.programs.includes(program)
  )
) {
  throw new Error("Not every recipe contains the requested program");
}

fs.writeFileSync(recipePath, updatedText);
console.log(
  `Added program '${program}' to ${missingProgramIndexes.size} of ${recipes.length} recipes.`
);
