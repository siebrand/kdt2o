// The state of the page that the modules share: the recipes and the weekly plan.
import {loadPlan, loadShoppingExclusions} from "./plan.js";
import {shoppingPlan, sortedShoppingItems} from "./shopping.js";

const hasPlanner = document.querySelector("#planner") !== null;
export const state = {
    recipes: [],
    plan: hasPlanner ? loadPlan() : {},
    // The ids of the planned recipes that the user leaves off the shopping list.
    excludedRecipeIds: hasPlanner ? loadShoppingExclusions() : new Set(),
    activeSlot: null,
    pendingRecipe: null,
    shoppingWarnings: []
};

export function recipeById(id) {
    return state.recipes.find((recipe) => recipe.id === id);
}

// The sorted shopping list of the current plan, without the excluded recipes. The checks go to state.shoppingWarnings.
export function currentShoppingItems() {
    state.shoppingWarnings = [];
    return sortedShoppingItems(shoppingPlan(state.plan, state.excludedRecipeIds), recipeById, state.shoppingWarnings);
}

// The planned recipes, once each, in the order of the week, and whether the shopping list counts them.
export function plannedRecipes() {
    const ids = [...new Set(Object.keys(state.plan).sort((a, b) => planOrder(a) - planOrder(b))
        .map((key) => state.plan[key].recipeId))];
    return ids.map((id) => ({id, recipe: recipeById(id), excluded: state.excludedRecipeIds.has(id)}));
}

function planOrder(key) {
    const [day, meal] = [Number(String(key).split("-")[0]), String(key).slice(String(key).indexOf("-") + 1)];
    return day * 3 + ["ontbijt", "lunch", "diner"].indexOf(meal);
}

// Shows a message in the status line of the planner page.
export function reportStatus(message) {
    const status = document.querySelector("#status");
    if (status) status.textContent = message;
}
