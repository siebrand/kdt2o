// Days, meals, and plan keys; the plan in localStorage and in share links.
export const DAYS = ["Maandag", "Dinsdag", "Woensdag", "Donderdag", "Vrijdag", "Zaterdag", "Zondag"];

export const MEALS = ["ontbijt", "lunch", "diner"];

export const PLAN_STORAGE_KEY = "kitano-weekplan";

export const PLAN_STORAGE_VERSION = 4;

export function recipeToken(id) {
    let hash = 14695981039346656037n;
    for (const byte of new TextEncoder().encode(id)) {
        hash ^= BigInt(byte);
        hash = BigInt.asUintN(64, hash * 1099511628211n);
    }
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    let token = "";
    let value = hash & ((1n << 48n) - 1n);
    for (let index = 0; index < 8; index += 1) {
        token = alphabet[Number(value & 63n)] + token;
        value >>= 6n;
    }
    return token;
}

export function compactPlan(plan) {
    return DAYS.flatMap((_, day) => MEALS.map((meal) => {
        const item = plan[planKey(day, meal)];
        if (!item) return "";
        if (typeof item.recipeId !== "string" || !item.recipeId) return "";
        const token = item.recipeId.startsWith("@token:") ? item.recipeId.slice(7) : recipeToken(item.recipeId);
        const sourceDay = Number.isInteger(item.sourceDay) && item.sourceDay >= 0 && item.sourceDay < DAYS.length ? item.sourceDay : day;
        return token + sourceDay;
    })).join(".");
}

export function expandPlan(compact) {
    const slots = typeof compact === "string" ? compact.split(".") : [];
    if (slots.length !== DAYS.length * MEALS.length) return null;
    const plan = {};
    slots.forEach((slot, index) => {
        if (!slot) return;
        const sourceDay = Number(slot.slice(-1));
        const token = slot.slice(0, -1);
        if (!/^[A-Za-z0-9_-]{8}$/.test(token) || !Number.isInteger(sourceDay) || sourceDay < 0 || sourceDay >= DAYS.length) return;
        const day = Math.floor(index / MEALS.length);
        const meal = MEALS[index % MEALS.length];
        plan[planKey(day, meal)] = {
            recipeId: "@token:" + token,
            sourceDay
        };
    });
    return plan;
}

export function resolvePlanRecipeTokens(plan, recipes) {
    const tokenMap = new Map();
    recipes.forEach((recipe) => {
        const token = recipeToken(recipe.id);
        if (tokenMap.has(token)) tokenMap.set(token, null);
        else tokenMap.set(token, recipe.id);
    });
    Object.values(plan).forEach((item) => {
        if (!item?.recipeId?.startsWith("@token:")) return;
        const recipeId = tokenMap.get(item.recipeId.slice(7));
        if (recipeId) item.recipeId = recipeId;
    });
    return plan;
}

export function encodeBase64Url(value) {
    const bytes = new TextEncoder().encode(value);
    let binary = "";
    bytes.forEach((byte) => {
        binary += String.fromCharCode(byte);
    });
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeBase64Url(value) {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return new TextDecoder().decode(bytes);
}

// The recipes that the user leaves off the shopping list are stored and shared as recipe tokens, such as
// "AbCdEfGh.IjKlMnOp". Only planned recipes are kept. A token that no recipe resolves stays "@token:…".
export function compactShoppingExclusions(excludedIds, plan) {
    const planned = new Set(Object.values(plan).map((item) => item?.recipeId));
    return [...excludedIds].filter((id) => planned.has(id))
        .map((id) => id.startsWith("@token:") ? id.slice(7) : recipeToken(id)).sort().join(".");
}

export function expandShoppingExclusions(compact) {
    return new Set(String(compact || "").split(".")
        .filter((token) => /^[A-Za-z0-9_-]{8}$/.test(token)).map((token) => "@token:" + token));
}

export function resolveShoppingExclusionTokens(excludedIds, recipes) {
    const byToken = new Map(recipes.map((recipe) => [recipeToken(recipe.id), recipe.id]));
    return new Set([...excludedIds].map((id) => id.startsWith("@token:") ? byToken.get(id.slice(7)) || id : id));
}

// The exclusions in the fragment of a share link, such as "#plan=v4.…&skip=AbCdEfGh".
export function shoppingExclusionsFromShareHash(hash) {
    return expandShoppingExclusions(new URLSearchParams(String(hash || "").replace(/^#/, "")).get("skip"));
}

// The plan in the fragment of a share link, such as "#plan=v4.…", or null. A malformed code throws an error.
export function planFromShareHash(hash) {
    const sharedPlan = new URLSearchParams(String(hash || "").replace(/^#/, "")).get("plan");
    if (!sharedPlan?.startsWith("v4.")) return null;
    return expandPlan(decodeBase64Url(sharedPlan.slice(3)));
}

export function loadPlan() {
    try {
        const shared = planFromShareHash(window.location.hash);
        if (shared) return shared;
        const saved = JSON.parse(localStorage.getItem(PLAN_STORAGE_KEY) || "null");
        if (saved?.version === PLAN_STORAGE_VERSION) return expandPlan(saved.plan) || {};
        return {};
    } catch {
        return {};
    }
}

// The exclusions that belong to the plan of loadPlan(): those of the share link, or else those that were saved.
export function loadShoppingExclusions() {
    try {
        if (planFromShareHash(window.location.hash)) return shoppingExclusionsFromShareHash(window.location.hash);
        const saved = JSON.parse(localStorage.getItem(PLAN_STORAGE_KEY) || "null");
        if (saved?.version === PLAN_STORAGE_VERSION) return expandShoppingExclusions(saved.excluded);
        return new Set();
    } catch {
        return new Set();
    }
}

export function dayName(dayIndex) {
    return DAYS[dayIndex].toLocaleLowerCase("nl");
}

export function shortDayName(dayIndex) {
    return DAYS[dayIndex].slice(0, 3).toLocaleLowerCase("nl");
}

export function planKey(day, meal) {
    return day + "-" + meal;
}

export function planKeyDay(key) {
    return Number(String(key).split("-")[0]);
}

export function planKeyMeal(key) {
    return String(key).slice(String(key).indexOf("-") + 1);
}

export function isMultiDay(recipe) {
    return Boolean(recipe.multiDay);
}

export function plannedDays(startDay, dayCount = 3) {
    return Array.from({length: dayCount}, (_, index) => startDay + index * 2).filter((day) => day < DAYS.length);
}
