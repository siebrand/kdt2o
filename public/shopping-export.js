// The machine-readable shopping list: format "kitano-shopping-list", version 1.
// docs/shopping-list-format.md describes the format and schemas/shopping-list.schema.json validates it.
import {
    normalizeShoppingName,
    normalizeShoppingUnit,
    parseAmountRange,
    shoppingCategory,
    shoppingIngredientLabel,
    shoppingPlan,
    sortedShoppingItems
} from "./shopping.js";

export const SHOPPING_LIST_FORMAT = "kitano-shopping-list";
export const SHOPPING_LIST_FORMAT_VERSION = 1;

function exportQuantity(item) {
    if (item.amount == null) return null;
    const range = parseAmountRange(item.amount);
    const unit = normalizeShoppingUnit(item.unit) || "stuk";
    if (!range || !(range.min > 0) || !(range.max > 0)) return null;
    return {min: range.min, max: range.max, unit};
}

// items are the sorted totals of sortedShoppingItems(); recipes are the planned recipes that the list counts, once
// each; excludedRecipes are the planned recipes that the user left off the list.
export function shoppingListDocument(items, recipes, {version = null, createdAt = new Date(), excludedRecipes = []} = {}) {
    return {
        format: SHOPPING_LIST_FORMAT,
        formatVersion: SHOPPING_LIST_FORMAT_VERSION,
        createdAt: createdAt.toISOString(),
        generator: {name: "kdt2o", version: version || null},
        language: "nl",
        recipes: recipes.map((recipe) => ({id: recipe.id, title: recipe.title})),
        excludedRecipes: excludedRecipes.map((recipe) => ({id: recipe.id, title: recipe.title})),
        items: items.map((item) => ({
            name: normalizeShoppingName(item.name),
            quantity: exportQuantity(item),
            optional: Boolean(item.optional),
            category: shoppingCategory(item),
            label: shoppingIngredientLabel(item, false)
        }))
    };
}

// The document of a plan. recipes are all recipes, with the shared subrecipes attached
// (attachSharedRecipeComponents() in recipes.js). excludedRecipeIds are the planned recipes that the user leaves off
// the list, as in shoppingExclusionsFromShareHash() of plan.js. The browser and shop-at-picnic both use this function.
export function planShoppingListDocument(plan, recipes, {excludedRecipeIds = new Set(), ...options} = {}) {
    const byId = new Map(recipes.map((recipe) => [recipe.id, recipe]));
    const findRecipe = (id) => byId.get(id);
    const items = sortedShoppingItems(shoppingPlan(plan, excludedRecipeIds), findRecipe);
    const plannedIds = [...new Set(Object.values(plan).map((item) => item.recipeId))];
    const counted = plannedIds.filter((id) => !excludedRecipeIds.has(id)).map(findRecipe).filter(Boolean);
    const excludedRecipes = plannedIds.filter((id) => excludedRecipeIds.has(id)).map(findRecipe).filter(Boolean);
    return shoppingListDocument(items, counted, {...options, excludedRecipes});
}

// Downloads a document as a JSON file. Only the browser application uses this function.
export function downloadJson(document_, filename) {
    const blob = new Blob([JSON.stringify(document_, null, 2) + "\n"], {type: "application/json"});
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
}
