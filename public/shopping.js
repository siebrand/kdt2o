// The shopping list: normalized ingredients, totals per week, categories, and labels.
import {MESSAGES} from "./messages.js";

export function normalizeShoppingUnit(unit) {
    const value = String(unit || "").toLocaleLowerCase("nl");
    const aliases = {
        g: "gram",
        gr: "gram",
        gram: "gram",
        ml: "ml",
        milliliter: "ml",
        stuks: "stuk",
        stuk: "stuk",
        eetlepel: "el",
        eetlepels: "el",
        theelepel: "tl",
        theelepels: "tl"
    };
    return aliases[value] || value;
}

export function normalizeShoppingName(name) {
    return String(name || "").toLocaleLowerCase("nl").trim()
        .replace(/\bcitroenen\b/g, "citroen")
        .replace(/\bcourgettes\b/g, "courgette")
        .replace(/\buien\b/g, "ui")
        .replace(/\bbouillonblokjes\b/g, "bouillonblokje")
        .replace(/\bwortelen\b/g, "wortel")
        .replace(/\bpaprika's\b/g, "paprika");
}

export function normalizeShoppingIngredient(ingredient) {
    const name = String(ingredient.name || "").toLocaleLowerCase("nl").trim();
    let raw = String(ingredient.raw || "").toLocaleLowerCase("nl").trim();
    if (name === "water") return {...ingredient, amount: null, unit: "", name: "water"};
    if (name === "ei" || name === "eieren") return {...ingredient, name: "ei"};
    if (name === "halve komkommer" || raw === "halve komkommer") {
        return {...ingredient, amount: 0.5, unit: "stuk", name: "komkommer"};
    }
    if (/^(?:plakjes|schijfjes) komkommer$/.test(name)) {
        return {...ingredient, name: "komkommer"};
    }
    const descriptiveMeasures = [
        {pattern: /^(?:een )?scheut(?:je)? (.+)$/, amount: 1, unit: "el"},
        {pattern: /^snufje (.+)$/, amount: 1, unit: "tl"},
        {pattern: /^mespunt (.+)$/, amount: 0.25, unit: "tl"},
        {pattern: /^(?:een )?handje (.+)$/, amount: 1, unit: "hand"},
        {pattern: /^handvol (.+)$/, amount: 1, unit: "hand"},
        {pattern: /^paar takjes (.+)$/, amount: 2, unit: "takje"},
        {pattern: /^takje (.+)$/, amount: 1, unit: "takje"},
        {pattern: /^half bosje (.+)$/, amount: 0.5, unit: "bosje"}
    ];
    const descriptive = descriptiveMeasures.find((measure) => measure.pattern.test(name));
    if (descriptive) {
        return {
            ...ingredient,
            amount: descriptive.amount,
            unit: descriptive.unit,
            name: name.replace(descriptive.pattern, "$1")
        };
    }
    if (raw.startsWith("1/2 ")) {
        let rest = raw.slice(4);
        let unit = "stuk";
        for (const candidate of ["tl", "el", "bosje"]) {
            if (rest.startsWith(candidate + " ")) {
                unit = candidate;
                rest = rest.slice(candidate.length + 1);
                break;
            }
        }
        return {...ingredient, amount: 0.5, unit, name: rest};
    }
    if (ingredient.amount != null && !ingredient.unit) {
        return {...ingredient, unit: "stuk"};
    }
    return ingredient;
}

export function parseAmountRange(amount) {
    if (typeof amount === "number" && Number.isFinite(amount)) return {min: amount, max: amount};
    const value = String(amount ?? "").trim();
    const fraction = value.match(/^(\d+)\s*\/\s*(\d+)$/);
    if (fraction && Number(fraction[2]) !== 0) {
        const result = Number(fraction[1]) / Number(fraction[2]);
        return {min: result, max: result};
    }
    const match = value.match(/^(\d+(?:[.,]\d+)?)\s*-\s*(\d+(?:[.,]\d+)?)$/);
    if (!match) return null;
    return {min: Number(match[1].replace(",", ".")), max: Number(match[2].replace(",", "."))};
}

export function addIngredientAmounts(first, second) {
    const firstRange = parseAmountRange(first);
    const secondRange = parseAmountRange(second);
    if (!firstRange || !secondRange) return null;
    const min = firstRange.min + secondRange.min;
    const max = firstRange.max + secondRange.max;
    return min === max ? min : `${min}-${max}`;
}

export function formatIngredientAmount(amount) {
    const range = parseAmountRange(amount);
    if (!range) return String(amount);
    const roundUp = (value) => Number.isInteger(value) ? value : Math.ceil(value);
    if (range.min === range.max) return String(roundUp(range.min));
    return `${roundUp(range.min)}-${roundUp(range.max)}`;
}

export function formatIngredientUnit(unit, amount) {
    const normalized = normalizeShoppingUnit(unit);
    if (normalized !== "el" && normalized !== "tl") return unit;
    const range = parseAmountRange(amount);
    const singular = range && range.min === range.max && range.min <= 1;
    if (normalized === "el") return singular ? "eetlepel" : "eetlepels";
    return singular ? "theelepel" : "theelepels";
}

export function copyShoppingIngredient(ingredient, normalizedUnit) {
    return {
        ...ingredient,
        normalizedUnit
    };
}

// A recipe's subrecipe is shared when the recipe's own ingredients refer to it with componentId, such as
// lijnzaadcrackers, granola, and notenbrood. The shopping list prepares a shared subrecipe once per week. If the
// referring ingredients use the subrecipe's yield unit, it makes enough batches for all of them; else one batch.
export function sharedComponentIds(recipe) {
    return new Set([
        ...(recipe?.ingredients || []),
        ...(recipe?.dailyVariants || []).flatMap((variant) => variant.ingredients || [])
    ].map((ingredient) => ingredient.componentId).filter(Boolean));
}

export function sharedComponentBatches(component, references) {
    const yieldUnit = normalizeShoppingUnit(component.yieldUnit || "stuk");
    let count = 0;
    for (const ingredient of references) {
        const parsed = parseAmountRange(ingredient.amount);
        if (!parsed || normalizeShoppingUnit(ingredient.unit || "stuk") !== yieldUnit) return 1;
        count += parsed.max;
    }
    return Math.max(1, Math.ceil(count / (component.yield || 1)));
}

// The weekly totals of a plan. findRecipe returns the recipe of an id; warnings receives the unit and amount checks.
// The function does not use the page, so programs outside the browser can use it too.
export function aggregateIngredients(plan, findRecipe, warnings = []) {
    const totals = new Map();
    const includedRecipeIds = new Set();
    const sharedComponents = new Map();
    const addIngredient = (ingredient, {warnings = true} = {}) => {
        const shoppingIngredient = normalizeShoppingIngredient(ingredient);
        if (shoppingIngredient.name === "water") return;
        const key = normalizeShoppingName(shoppingIngredient.name);
        const unit = normalizeShoppingUnit(shoppingIngredient.unit);
        // Needed and optional amounts stay apart: the needed total in the main list, the optional extra under
        // "Optioneel". The order of the recipes then cannot decide whether a needed ingredient looks optional.
        const mapKey = key + "::" + unit + (shoppingIngredient.optional ? "::optioneel" : "");
        if (warnings) {
            const otherUnitKey = [...totals.keys()].find((existingKey) => {
                const [existingName, existingUnit] = existingKey.split("::");
                return existingName === key && existingUnit !== unit;
            });
            if (otherUnitKey) {
                const warning = MESSAGES.checkUnit(ingredient.name);
                if (!warnings.includes(warning)) warnings.push(warning);
            }
        }
        const existing = totals.get(mapKey);
        if (!existing) {
            totals.set(mapKey, copyShoppingIngredient(shoppingIngredient, unit));
            return;
        }
        if (!warnings) {
            if (shoppingIngredient.amount == null || existing.amount == null) return;
        } else if (shoppingIngredient.amount == null) {
            if (existing.amount == null) return;
            warnings.push(MESSAGES.checkAmount(shoppingIngredient.name));
            totals.set(mapKey + "::" + totals.size, copyShoppingIngredient(shoppingIngredient, unit));
            return;
        } else if (existing.amount == null) {
            totals.set(mapKey + "::" + totals.size, copyShoppingIngredient(shoppingIngredient, unit));
            return;
        }
        const combinedAmount = addIngredientAmounts(existing.amount, shoppingIngredient.amount);
        if (combinedAmount !== null) existing.amount = combinedAmount;
    };
    Object.values(plan).forEach((item) => {
        if (includedRecipeIds.has(item.recipeId)) return;
        includedRecipeIds.add(item.recipeId);
        const recipe = findRecipe(item.recipeId);
        const sharedIds = sharedComponentIds(recipe);
        const ingredients = [
            ...(recipe?.ingredients || []),
            ...(recipe?.dailyVariants || []).flatMap((variant) => variant.ingredients || [])
        ];
        (recipe?.components || []).forEach((component) => {
            if (!sharedIds.has(component.id)) return;
            const shared = sharedComponents.get(component.id) || {component, references: []};
            shared.references.push(...ingredients.filter((ingredient) => ingredient.componentId === component.id));
            sharedComponents.set(component.id, shared);
        });
        [
            ...ingredients,
            ...(recipe?.components || [])
                .filter((component) => component.includeInShoppingList !== false && !sharedIds.has(component.id))
                .flatMap((component) => component.ingredients || [])
        ].forEach((ingredient) => {
            if (!ingredient.componentId) addIngredient(ingredient);
        });
    });
    sharedComponents.forEach(({component, references}) => {
        if (component.includeInShoppingList === false) return;
        const batches = sharedComponentBatches(component, references);
        component.ingredients.forEach((ingredient) => addIngredient({
            ...ingredient,
            amount: typeof ingredient.amount === "number" ? ingredient.amount * batches : ingredient.amount
        }, {warnings: false}));
    });
    return [...totals.values()];
}

export const SHOPPING_CATEGORIES = [
    "Groente en fruit",
    "Zuivel en eieren",
    "Vlees, vis en vleesvervangers",
    "Brood en ontbijt",
    "Diepvries",
    "Kruiden en smaakmakers",
    "Houdbare producten",
    "Overig"
];

export const APPROVED_OTHER_NAMES = new Set(["bakpapier"]);

export function shoppingCategory(item) {
    if (item.category && item.category !== "Overig") return item.category;
    const name = String(item.name || "").toLocaleLowerCase("nl");
    const has = (...terms) => terms.some((term) => name.includes(term));
    const hasWord = (...terms) => terms.some((term) => new RegExp(`(^|[^a-z])${term}($|[^a-z])`).test(name));

    if (has("diepvries", "bevroren")) return "Diepvries";
    if (has("kokosmelk", "bouillon", "zongedroogde", "olijf", "olijven", "kelp")) return "Houdbare producten";
    if (has("wortel", "courgette", "paprika", "tomaat", "tomaten", "cherry tom", "komkommer", "biet", "avocado", "broccoli", "bloemkool", "spinazie", "sla", "salade", "rucola", "andijvie", "aubergine", "augurk", "bleekselderij", "venkel", "mais", "mandarijn", "sinaasappel", "champignon", "knoflook", "gember", "citroen", "limoen", "appel", "banaan", "aardbei", "framboos", "bosbes", "blauwe bes", "mango", "peer", "druif", "fruit", "kikkererwt", "erwt", "snijboon", "witlof", "lenteui", "bosui", "prei", "preien", "spruit", "taugé", "knolselderij", "pastinaak", "zuurkool", "artisjok", "pompoen", "bladgroente", "bladsalade", "gegrilde groenten", "paksoi", "chinese kool", "nasi/bami groenten", "rode kool") || hasWord("ui", "uien")) return "Groente en fruit";
    if (has("yoghurt", "kwark", "melk", "kaas", "feta", "ricotta", "mozzarella", "hüttenkäse", "huttenkase", "boter", "room", "crême", "crème", "creme", "fraiche", "fraîche") || hasWord("ei", "eieren")) return "Zuivel en eieren";
    if (has("kip", "rund", "gehakt", "spek", "ham", "zalm", "tonijn", "vis", "pangasius", "haring", "biefstuk", "tartaar", "tofu", "tempeh", "garnalen", "ansjovis")) return "Vlees, vis en vleesvervangers";
    if (has("brood", "cracker", "havermout", "muesli", "granola")) return "Brood en ontbijt";
    if (has("zout", "peper", "kaneel", "kruiden", "oregano", "basilicum", "komijn", "kerrie", "paprikapoeder", "salie", "peterselie", "dille", "koriander", "bieslook", "chilipoeder", "chilivlokken", "kurkuma", "nootmuskaat", "vanille", "kruidnagel", "tijm", "chili", "jalapeno", "spices")) return "Kruiden en smaakmakers";
    if (has("pasta", "rijst", "quinoa", "couscous", "linzen", "bonen", "noten", "amandel", "zaad", "pitten", "olie", "azijn", "meel", "bloem", "bakpoeder", "cacao", "chocolade", "pindakaas", "honing", "kokos", "mayonaise", "sojasaus", "mosterd", "pesto", "kokosmelk", "bakpapier")) return "Houdbare producten";
    return "Overig";
}

export function sortedShoppingItems(plan, findRecipe, warnings = []) {
    return aggregateIngredients(plan, findRecipe, warnings).sort((a, b) => {
        const categoryDifference = SHOPPING_CATEGORIES.indexOf(shoppingCategory(a)) - SHOPPING_CATEGORIES.indexOf(shoppingCategory(b));
        const optionalDifference = Number(Boolean(a.optional)) - Number(Boolean(b.optional));
        return categoryDifference || optionalDifference || a.name.localeCompare(b.name, "nl");
    });
}

// The item is a shopping-list total from aggregateIngredients(), which is normalized already. Normalizing it again
// would apply rules for the raw text of the first recipe that added it, such as "halve komkommer", to the total.
export function formatIngredientLabel(item, includeOptionalPrefix = true) {
    const displayUnit = formatIngredientUnit(item.unit, item.amount);
    const amount = item.amount == null ? "" : formatIngredientAmount(item.amount) + (displayUnit ? " " + displayUnit : "");
    const range = parseAmountRange(item.amount);
    const displayName = item.name === "ei" && (!range || range.min !== 1 || range.max !== 1) ? "eieren" : item.name;
    return (includeOptionalPrefix && item.optional ? MESSAGES.optionalPrefix : "") + amount + (amount ? " " : "") + displayName;
}

export function shoppingIngredientLabel(item, includeOptionalPrefix = true) {
    return formatIngredientLabel(item, includeOptionalPrefix);
}
