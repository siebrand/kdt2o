// Helpers for the recipe data: availability, preparation time, shared subrecipes, and display labels.
import {MESSAGES} from "./messages.js";

export function recipeIsAvailable(recipe) {
    return recipe.approved === true;
}

export function shuffleRecipes(recipes) {
    const shuffled = [...recipes];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
    }
    return shuffled;
}

export function estimatePreparationTime(recipe) {
    const method = [recipe.method || "", ...(recipe.components || []).map((component) => component.method || "")].join(" ");
    const durations = [...method.matchAll(/(\d+)(?:\s*-\s*(\d+))?\s*(?:minuten|min\.?)/gi)]
        .map((match) => Number(match[2] || match[1]))
        .filter((value) => Number.isFinite(value));
    if (durations.length) return Math.max(10, Math.min(180, Math.ceil(durations.reduce((total, value) => total + value, 0) / 5) * 5));
    const complexity = method.length > 900 ? 45 : method.length > 450 ? 30 : method.length > 180 ? 20 : 15;
    return complexity;
}

export function addPreparationTime(recipe) {
    if (Number.isFinite(recipe.preparationTime)) return recipe;
    return {...recipe, preparationTime: estimatePreparationTime(recipe), preparationTimeEstimated: true};
}

export function attachSharedRecipeComponents(recipes) {
    const sharedComponents = new Map();
    recipes.forEach((recipe) => (recipe.components || []).forEach((component) => {
        if (!sharedComponents.has(component.id)) sharedComponents.set(component.id, component);
    }));
    return recipes.map((recipe) => {
        const components = [...(recipe.components || [])];
        const referencedIds = new Set([
            ...(recipe.ingredients || []),
            ...(recipe.dailyVariants || []).flatMap((variant) => variant.ingredients || [])
        ].map((ingredient) => ingredient.componentId).filter(Boolean));
        referencedIds.forEach((id) => {
            const shared = sharedComponents.get(id);
            if (!shared || components.some((item) => item.id === id)) return;
            components.push({
                ...shared,
                ingredients: shared.ingredients.map((ingredient) => ({...ingredient})),
                equipment: [...(shared.equipment || [])]
            });
        });
        return components.length === (recipe.components || []).length ? recipe : {...recipe, components};
    });
}

export function recipeVariantForDay(recipe, dayIndex, sourceDay) {
    if (!recipe?.dailyVariants?.length) return null;
    const variantIndex = Number.isInteger(sourceDay) ? Math.round((dayIndex - sourceDay) / 2) : 0;
    return recipe.dailyVariants.find((variant) => variant.dayIndex === variantIndex) || null;
}

export function recipeTimingLabel(recipe) {
    const timing = [];
    if (Number.isFinite(recipe?.preparationTime)) timing.push(MESSAGES.preparationTime(recipe.preparationTime));
    if (Number.isFinite(recipe?.ovenTime)) timing.push(MESSAGES.ovenTime(recipe.ovenTime));
    return timing.join(" | ");
}

export function recipeMetadataLabel(recipe) {
    const metadata = [recipe?.categories?.join(" / ") || MESSAGES.recipe, recipe?.portions ? MESSAGES.portions(recipe.portions) : ""].filter(Boolean);
    const timing = recipeTimingLabel(recipe);
    if (timing) metadata.push(timing);
    return metadata.join(" · ");
}

export function methodSteps(method) {
    return window.recipeMethodSteps(method);
}

export function recipeIngredients(recipe) {
    return [
        ...(recipe?.ingredients || []),
        ...(recipe?.dailyVariants || []).flatMap((variant) => variant.ingredients || []),
        ...(recipe?.components || []).flatMap((component) => component.ingredients || [])
    ];
}

export function recipeEquipment(recipe) {
    return [
        ...(recipe?.equipment || []),
        ...(recipe?.components || []).flatMap((component) => component.equipment || [])
    ];
}

export function recipeMethod(recipe) {
    const sections = [];
    (recipe?.components || []).forEach((component) => {
        sections.push(component.title + ":");
        sections.push(component.method || "");
    });
    if (recipe?.method) sections.push(recipe.method);
    (recipe?.dailyVariants || []).forEach((variant) => {
        sections.push(variant.title + ":");
        sections.push(variant.method || "");
    });
    return sections.join(" ").trim();
}

export function sortIngredientsForDisplay(ingredients) {
    return [...ingredients].sort((a, b) => Number(Boolean(a.optional)) - Number(Boolean(b.optional)));
}

export function ingredientLabel(item, includeOptionalPrefix = true) {
    const prefix = includeOptionalPrefix && item.optional ? MESSAGES.optionalPrefix : "";
    const main = prefix + String(item.raw || item.name || "");
    const alternatives = (item.alternatives || []).map((alternative) => {
        const alternativePrefix = includeOptionalPrefix && alternative.optional ? MESSAGES.optionalPrefix : "";
        return alternativePrefix + String(alternative.raw || alternative.name || "");
    });
    return alternatives.length ? main + " of " + alternatives.join(" of ") : main;
}
