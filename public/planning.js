// The rules to move a planned recipe, shared by drag and drop and the move buttons.
import {MESSAGES} from "./messages.js";
import {DAYS, isMultiDay, planKey, planKeyDay, planKeyMeal, plannedDays} from "./plan.js";
import {recipeById, state} from "./state.js";

export function selectionStartDay(key, item) {
    return Number.isInteger(item?.sourceDay) ? item.sourceDay : planKeyDay(key);
}

export function selectionKeys(recipeId, meal, sourceDay) {
    return Object.entries(state.plan)
        .filter(([key, item]) => item?.recipeId === recipeId && planKeyMeal(key) === meal && selectionStartDay(key, item) === sourceDay)
        .map(([key]) => key);
}

export function selectionDayCount(recipe) {
    return isMultiDay(recipe) ? (recipe.days || 3) : 1;
}

export function selectionDays(recipe, startDay) {
    return isMultiDay(recipe) ? plannedDays(startDay, recipe.days) : [startDay];
}

// Returns the plan after a move of the selection on sourceKey to targetKey, or an error message if the move is not
// possible. Drag and drop and the move buttons both use this function, so they accept the same moves.
export function planSelectionMove(sourceKey, targetKey) {
    const sourceItem = state.plan[sourceKey];
    if (sourceKey === targetKey || !sourceItem) return {error: null};
    const meal = planKeyMeal(sourceKey);
    if (meal !== planKeyMeal(targetKey)) {
        return {error: MESSAGES.moveToOtherMeal};
    }
    const sourceRecipe = recipeById(sourceItem.recipeId);
    if (!sourceRecipe) {
        return {error: MESSAGES.moveUnknownRecipe};
    }
    // The dragged selection shifts by the distance between the dragged card and the drop cell. This also allows a
    // multi-day recipe to be dropped on one of its own later days or on an empty cell.
    const draggedDay = planKeyDay(sourceKey);
    const targetDay = planKeyDay(targetKey);
    const offset = targetDay - draggedDay;
    const sourceStart = selectionStartDay(sourceKey, sourceItem);
    const newStart = sourceStart + offset;
    const sourceKeys = selectionKeys(sourceItem.recipeId, meal, sourceStart);
    const sourceDays = newStart >= 0 ? selectionDays(sourceRecipe, newStart) : [];
    if (sourceDays.length !== selectionDayCount(sourceRecipe)) {
        return {error: MESSAGES.moveDoesNotFit};
    }
    // Every other selection in the way is moved aside. The recipe on the drop cell prefers the dragged position, so a
    // drop on another card behaves like a swap; other recipes prefer to stay as close as possible to where they were.
    const targetItem = state.plan[targetKey];
    const displaced = [];
    sourceDays.forEach((day) => {
        const key = planKey(day, meal);
        const item = state.plan[key];
        if (!item || sourceKeys.includes(key)) return;
        const originalStart = selectionStartDay(key, item);
        if (displaced.some((entry) => entry.recipeId === item.recipeId && entry.originalStart === originalStart)) return;
        const isTarget = key === targetKey && targetItem;
        displaced.push({
            recipeId: item.recipeId,
            originalStart,
            preferredStart: isTarget ? originalStart - offset : originalStart
        });
    });
    const nextPlan = {...state.plan};
    sourceKeys.forEach((key) => delete nextPlan[key]);
    displaced.forEach((entry) => {
        selectionKeys(entry.recipeId, meal, entry.originalStart).forEach((key) => delete nextPlan[key]);
    });
    sourceDays.forEach((day) => {
        nextPlan[planKey(day, meal)] = {recipeId: sourceItem.recipeId, sourceDay: newStart};
    });
    for (const entry of displaced) {
        const recipe = recipeById(entry.recipeId);
        const count = recipe ? selectionDayCount(recipe) : 1;
        const starts = DAYS.map((_, day) => day)
            .filter((start) => {
                const days = recipe ? selectionDays(recipe, start) : [start];
                return days.length === count && days.every((day) => !nextPlan[planKey(day, meal)]);
            })
            .sort((a, b) => Math.abs(a - entry.preferredStart) - Math.abs(b - entry.preferredStart) || a - b);
        if (!starts.length) {
            return {error: MESSAGES.moveNoRoom};
        }
        const days = recipe ? selectionDays(recipe, starts[0]) : [starts[0]];
        days.forEach((day) => {
            nextPlan[planKey(day, meal)] = {recipeId: entry.recipeId, sourceDay: starts[0]};
        });
    }
    return {plan: nextPlan};
}

// A move button moves the card to the nearest day in its direction where a drop of the card would succeed, so the
// buttons can make every move that drag and drop can make, also past a day where a recipe cannot move aside.
export function nearestMove(key, step) {
    for (let day = planKeyDay(key) + step; day >= 0 && day < DAYS.length; day += step) {
        const targetKey = planKey(day, planKeyMeal(key));
        const move = planSelectionMove(key, targetKey);
        if (move.plan) return {targetKey, plan: move.plan};
    }
    return null;
}
