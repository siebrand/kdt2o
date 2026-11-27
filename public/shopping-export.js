// The machine-readable shopping list: format "kitano-shopping-list", version 1.
// docs/shopping-list-format.md describes the format and schemas/shopping-list.schema.json validates it.
import {
    normalizeShoppingName,
    normalizeShoppingUnit,
    parseAmountRange,
    shoppingCategory,
    shoppingIngredientLabel,
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

// items are the sorted totals of sortedShoppingItems(); recipes are the planned recipes, once each.
export function shoppingListDocument(items, recipes, {version = null, createdAt = new Date()} = {}) {
    return {
        format: SHOPPING_LIST_FORMAT,
        formatVersion: SHOPPING_LIST_FORMAT_VERSION,
        createdAt: createdAt.toISOString(),
        generator: {name: "kdt2o", version: version || null},
        language: "nl",
        recipes: recipes.map((recipe) => ({id: recipe.id, title: recipe.title})),
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
// (attachSharedRecipeComponents() in recipes.js). The browser and shop-at-picnic both use this function.
export function planShoppingListDocument(plan, recipes, options = {}) {
    const byId = new Map(recipes.map((recipe) => [recipe.id, recipe]));
    const findRecipe = (id) => byId.get(id);
    const items = sortedShoppingItems(plan, findRecipe);
    const plannedIds = [...new Set(Object.values(plan).map((item) => item.recipeId))];
    return shoppingListDocument(items, plannedIds.map(findRecipe).filter(Boolean), options);
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
