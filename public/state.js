// The state of the page that the modules share: the recipes and the weekly plan.
import {loadPlan} from "./plan.js";
import {sortedShoppingItems} from "./shopping.js";

const hasPlanner = document.querySelector("#planner") !== null;
export const state = {
    recipes: [],
    plan: hasPlanner ? loadPlan() : {},
    activeSlot: null,
    pendingRecipe: null,
    shoppingWarnings: []
};

export function recipeById(id) {
    return state.recipes.find((recipe) => recipe.id === id);
}

// The sorted shopping list of the current plan. The unit and amount checks go to state.shoppingWarnings.
export function currentShoppingItems() {
    state.shoppingWarnings = [];
    return sortedShoppingItems(state.plan, recipeById, state.shoppingWarnings);
}

// Shows a message in the status line of the planner page.
export function reportStatus(message) {
    const status = document.querySelector("#status");
    if (status) status.textContent = message;
}
