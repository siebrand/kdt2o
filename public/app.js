const DAYS = ["Maandag", "Dinsdag", "Woensdag", "Donderdag", "Vrijdag", "Zaterdag", "Zondag"];
const MEALS = ["ontbijt", "lunch", "diner"];
const PLAN_STORAGE_KEY = "kitano-weekplan";
const PLAN_STORAGE_VERSION = 4;
const MESSAGES = {
    versionLabel: "Versie",
    localVersion: "Lokale versie",
    versionUnavailable: "Versie onbekend",
    dragHint: "Sleep om te wisselen binnen hetzelfde maaltijdtype",
    moveEarlier: (title, day) => `${title} op ${day} naar een eerdere dag verplaatsen`,
    moveLater: (title, day) => `${title} op ${day} naar een latere dag verplaatsen`,
    removeRecipe: (title) => `${title} verwijderen`,
    removeMultiDayRecipe: (title) => `${title} verwijderen van alle dagen`,
    recipeRemoved: (title) => `${title} is verwijderd.`,
    undo: "Ongedaan maken",
    undoUnavailable: "Het verwijderen kan niet ongedaan worden gemaakt omdat deze momenten weer gevuld zijn."
};
const UNDO_TIMEOUT_MS = 10000;
const VERSION_PATTERN = /^[0-9]{4}-[0-9]{2}-[0-9]{2}\.[0-9]{12,}-[0-9a-f]{40}$/;
const hasPlanner = document.querySelector("#planner") !== null;
const state = {
    recipes: [],
    plan: hasPlanner ? loadPlan() : {},
    activeSlot: null,
    pendingRecipe: null,
    shoppingWarnings: []
};

const planner = document.querySelector("#planner");
const options = document.querySelector("#recipe-options");
const status = document.querySelector("#status");
const search = document.querySelector("#search");
const randomFillButton = document.querySelector("#random-fill");
const copyMenuLinkButton = document.querySelector("#copy-menu-link");
const singleRecipeCategory = document.querySelector("#single-recipe-category");
const singleRecipeQuery = document.querySelector("#single-recipe-query");
const singleRecipeResults = document.querySelector("#single-recipe-results");
const downloadButton = document.querySelector("#download-pdf");
const shoppingListButton = document.querySelector("#show-shopping-list");
const shoppingListView = document.querySelector("#shopping-list-view");
const singleRecipeSearch = document.querySelector("#single-recipe-search");
const shoppingListItems = document.querySelector("#shopping-list-items");
const notifications = document.querySelector("#notifications");
const recipePanel = document.querySelector("#recipe-panel");
const appVersion = document.querySelector("#app-version");
const dragState = {sourceKey: null};

function recipeIsAvailable(recipe) {
    return recipe.approved === true;
}

function recipeToken(id) {
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

function compactPlan(plan) {
    return DAYS.flatMap((_, day) => MEALS.map((meal) => {
        const item = plan[planKey(day, meal)];
        if (!item) return "";
        if (typeof item.recipeId !== "string" || !item.recipeId) return "";
        const token = item.recipeId.startsWith("@token:") ? item.recipeId.slice(7) : recipeToken(item.recipeId);
        const sourceDay = Number.isInteger(item.sourceDay) && item.sourceDay >= 0 && item.sourceDay < DAYS.length ? item.sourceDay : day;
        return token + sourceDay;
    })).join(".");
}

function expandPlan(compact) {
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

function resolvePlanRecipeTokens(plan, recipes) {
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

function encodeBase64Url(value) {
    const bytes = new TextEncoder().encode(value);
    let binary = "";
    bytes.forEach((byte) => {
        binary += String.fromCharCode(byte);
    });
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeBase64Url(value) {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return new TextDecoder().decode(bytes);
}

function loadPlan() {
    try {
        const sharedPlan = new URLSearchParams(window.location.hash.slice(1)).get("plan");
        if (sharedPlan) {
            if (sharedPlan.startsWith("v4.")) {
                const shared = expandPlan(decodeBase64Url(sharedPlan.slice(3)));
                if (shared) return shared;
            }
        }
        const saved = JSON.parse(localStorage.getItem(PLAN_STORAGE_KEY) || "null");
        if (saved?.version === PLAN_STORAGE_VERSION) return expandPlan(saved.plan) || {};
        return {};
    } catch {
        return {};
    }
}

function shareablePlanUrl() {
    const url = new URL(window.location.href);
    url.hash = "plan=v4." + encodeBase64Url(compactPlan(state.plan));
    return url.toString();
}

async function copyMenuLink() {
    const link = shareablePlanUrl();
    try {
        await navigator.clipboard.writeText(link);
    } catch {
        const input = document.createElement("textarea");
        input.value = link;
        input.setAttribute("readonly", "");
        input.style.position = "fixed";
        input.style.opacity = "0";
        document.body.append(input);
        input.select();
        document.execCommand("copy");
        input.remove();
    }
    showSelectionMessage("Koppeling naar menu gekopieerd.");
}

function savePlan() {
    localStorage.setItem(PLAN_STORAGE_KEY, JSON.stringify({
        version: PLAN_STORAGE_VERSION,
        plan: compactPlan(state.plan)
    }));
}

function dayName(dayIndex) {
    return DAYS[dayIndex].toLocaleLowerCase("nl");
}

function shortDayName(dayIndex) {
    return DAYS[dayIndex].slice(0, 3).toLocaleLowerCase("nl");
}

function planKey(day, meal) {
    return day + "-" + meal;
}

function planKeyDay(key) {
    return Number(String(key).split("-")[0]);
}

function planKeyMeal(key) {
    return String(key).slice(String(key).indexOf("-") + 1);
}

function selectionStartDay(key, item) {
    return Number.isInteger(item?.sourceDay) ? item.sourceDay : planKeyDay(key);
}

function selectionKeys(recipeId, meal, sourceDay) {
    return Object.entries(state.plan)
        .filter(([key, item]) => item?.recipeId === recipeId && planKeyMeal(key) === meal && selectionStartDay(key, item) === sourceDay)
        .map(([key]) => key);
}

function selectionDayCount(recipe) {
    return isMultiDay(recipe) ? (recipe.days || 3) : 1;
}

function selectionDays(recipe, startDay) {
    return isMultiDay(recipe) ? plannedDays(startDay, recipe.days) : [startDay];
}

// Returns the plan after a move of the selection on sourceKey to targetKey, or an error message if the move is not
// possible. Drag and drop and the move buttons both use this function, so they accept the same moves.
function planSelectionMove(sourceKey, targetKey) {
    const sourceItem = state.plan[sourceKey];
    if (sourceKey === targetKey || !sourceItem) return {error: null};
    const meal = planKeyMeal(sourceKey);
    if (meal !== planKeyMeal(targetKey)) {
        return {error: "Kaarten kunnen alleen binnen hetzelfde maaltijdtype worden verplaatst."};
    }
    const sourceRecipe = recipeById(sourceItem.recipeId);
    if (!sourceRecipe) {
        return {error: "Een onbekend recept kan niet worden verplaatst."};
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
        return {error: "Deze kaart kan hier niet worden geplaatst omdat een meerdaags recept niet in de week past."};
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
            return {error: "Deze kaart kan hier niet worden geplaatst omdat er geen ruimte is om de andere recepten te verplaatsen."};
        }
        const days = recipe ? selectionDays(recipe, starts[0]) : [starts[0]];
        days.forEach((day) => {
            nextPlan[planKey(day, meal)] = {recipeId: entry.recipeId, sourceDay: starts[0]};
        });
    }
    return {plan: nextPlan};
}

function applyPlan(plan) {
    state.plan = plan;
    savePlan();
    render();
}

function swapPlanSelections(sourceKey, targetKey) {
    const move = planSelectionMove(sourceKey, targetKey);
    if (move.plan) applyPlan(move.plan);
    else if (move.error) showSelectionMessage(move.error);
}

// A move button moves the card to the nearest day in its direction where a drop of the card would succeed, so the
// buttons can make every move that drag and drop can make, also past a day where a recipe cannot move aside.
function nearestMove(key, step) {
    for (let day = planKeyDay(key) + step; day >= 0 && day < DAYS.length; day += step) {
        const targetKey = planKey(day, planKeyMeal(key));
        const move = planSelectionMove(key, targetKey);
        if (move.plan) return {targetKey, plan: move.plan};
    }
    return null;
}

function moveSelection(key, step, action) {
    const move = nearestMove(key, step);
    if (!move) return;
    applyPlan(move.plan);
    const targetKey = move.targetKey;
    const card = planner.querySelector(`[data-plan-key="${targetKey}"]`);
    const button = card?.querySelector(`[data-action="${action}"]:not(:disabled)`) || card?.querySelector("[data-action]:not(:disabled)");
    button?.focus();
}

function removeSelection(key) {
    const item = state.plan[key];
    if (!item) return;
    const removed = Object.entries(state.plan).filter(([, plannedItem]) => plannedItem.recipeId === item.recipeId);
    removed.forEach(([removedKey]) => delete state.plan[removedKey]);
    savePlan();
    render();
    showUndoMessage(MESSAGES.recipeRemoved(recipeById(item.recipeId)?.title || "Onbekend recept"), () => {
        if (selectedIds().has(item.recipeId) || removed.some(([removedKey]) => state.plan[removedKey])) {
            showSelectionMessage(MESSAGES.undoUnavailable);
            return;
        }
        removed.forEach(([removedKey, removedItem]) => {
            state.plan[removedKey] = removedItem;
        });
        savePlan();
        render();
        planner.querySelector(`[data-plan-key="${key}"] [data-action="remove"]`)?.focus();
    }, key);
}

function shuffleRecipes(recipes) {
    const shuffled = [...recipes];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
    }
    return shuffled;
}

function recipeById(id) {
    return state.recipes.find((recipe) => recipe.id === id);
}

function estimatePreparationTime(recipe) {
    const method = [recipe.method || "", ...(recipe.components || []).map((component) => component.method || "")].join(" ");
    const durations = [...method.matchAll(/(\d+)(?:\s*-\s*(\d+))?\s*(?:minuten|min\.?)/gi)]
        .map((match) => Number(match[2] || match[1]))
        .filter((value) => Number.isFinite(value));
    if (durations.length) return Math.max(10, Math.min(180, Math.ceil(durations.reduce((total, value) => total + value, 0) / 5) * 5));
    const complexity = method.length > 900 ? 45 : method.length > 450 ? 30 : method.length > 180 ? 20 : 15;
    return complexity;
}

function addPreparationTime(recipe) {
    if (Number.isFinite(recipe.preparationTime)) return recipe;
    return {...recipe, preparationTime: estimatePreparationTime(recipe), preparationTimeEstimated: true};
}

function attachSharedRecipeComponents(recipes) {
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

function selectedIds() {
    return new Set(Object.values(state.plan).filter(Boolean).map((item) => item.recipeId));
}

function isMultiDay(recipe) {
    return Boolean(recipe.multiDay);
}

function plannedDays(startDay, dayCount = 3) {
    return Array.from({length: dayCount}, (_, index) => startDay + index * 2).filter((day) => day < DAYS.length);
}

function recipeVariantForDay(recipe, dayIndex, sourceDay) {
    if (!recipe?.dailyVariants?.length) return null;
    const variantIndex = Number.isInteger(sourceDay) ? Math.round((dayIndex - sourceDay) / 2) : 0;
    return recipe.dailyVariants.find((variant) => variant.dayIndex === variantIndex) || null;
}

function renderPlanner() {
    planner.replaceChildren();
    planner.append(Object.assign(document.createElement("div"), {
        className: "planner-cell day",
        textContent: "Maaltijd"
    }));
    DAYS.forEach((day) => planner.append(Object.assign(document.createElement("div"), {
        className: "planner-cell day",
        textContent: day
    })));
    MEALS.forEach((meal) => {
        planner.append(Object.assign(document.createElement("div"), {
            className: "planner-cell meal-label",
            textContent: meal[0].toUpperCase() + meal.slice(1)
        }));
        DAYS.forEach((_, dayIndex) => {
            const cell = document.createElement("div");
            cell.className = "planner-cell";
            cell.addEventListener("dragover", (event) => {
                if (dragState.sourceKey && planKeyMeal(dragState.sourceKey) === meal) {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                    cell.classList.add("drag-over");
                }
            });
            cell.addEventListener("dragleave", () => cell.classList.remove("drag-over"));
            cell.addEventListener("drop", (event) => {
                event.preventDefault();
                cell.classList.remove("drag-over");
                const sourceKey = event.dataTransfer.getData("text/plain") || dragState.sourceKey;
                swapPlanSelections(sourceKey, planKey(dayIndex, meal));
            });
            const key = planKey(dayIndex, meal);
            const item = state.plan[key];
            const slot = document.createElement(item ? "div" : "button");
            slot.className = "slot";
            slot.dataset.planKey = key;
            if (item) {
                slot.draggable = true;
                slot.title = MESSAGES.dragHint;
                slot.addEventListener("dragstart", (event) => {
                    dragState.sourceKey = key;
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", dragState.sourceKey);
                    slot.classList.add("dragging");
                });
                slot.addEventListener("dragend", () => {
                    dragState.sourceKey = null;
                    slot.classList.remove("dragging");
                    document.querySelectorAll(".drag-over").forEach((element) => element.classList.remove("drag-over"));
                });
                const recipe = recipeById(item.recipeId);
                const recipeTitle = recipe?.title || "Onbekend recept";
                const title = document.createElement("strong");
                title.textContent = recipeTitle;
                slot.append(title);
                if (recipe?.multiDay) {
                    const schedule = document.createElement("small");
                    schedule.textContent = plannedDays(item.sourceDay, recipe.days).map((day) => shortDayName(day)).join(", ");
                    slot.append(schedule);
                }
                const variant = recipeVariantForDay(recipe, dayIndex, item.sourceDay);
                if (variant) {
                    const variantLabel = document.createElement("small");
                    variantLabel.textContent = variant.title;
                    slot.append(variantLabel);
                }
                if (recipe?.advanceNotice) {
                    const notice = document.createElement("small");
                    notice.textContent = "Let op: " + recipe.advanceNotice;
                    slot.append(notice);
                }
                const actions = document.createElement("div");
                actions.className = "slot-actions";
                actions.append(
                    slotActionButton("move-earlier", "←", MESSAGES.moveEarlier(recipeTitle, dayName(dayIndex)),
                        !nearestMove(key, -1), () => moveSelection(key, -1, "move-earlier")),
                    slotActionButton("move-later", "→", MESSAGES.moveLater(recipeTitle, dayName(dayIndex)),
                        !nearestMove(key, 1), () => moveSelection(key, 1, "move-later")),
                    slotActionButton("remove", "×",
                        recipe?.multiDay ? MESSAGES.removeMultiDayRecipe(recipeTitle) : MESSAGES.removeRecipe(recipeTitle),
                        false, () => removeSelection(key))
                );
                slot.append(actions);
                slot.addEventListener("click", (event) => {
                    if (event.target.closest("button") || dragState.sourceKey) return;
                    openRecipeHtml(recipe);
                });
            } else {
                slot.type = "button";
                slot.textContent = "+ Recept kiezen";
                slot.addEventListener("click", () => {
                    state.activeSlot = {day: dayIndex, meal};
                    renderOptions();
                    document.querySelector("#recipe-title").scrollIntoView({behavior: "smooth", block: "start"});
                });
            }
            cell.append(slot);
            planner.append(cell);
        });
    });
}

function slotActionButton(action, symbol, label, disabled, onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "slot-action";
    button.dataset.action = action;
    button.textContent = symbol;
    button.title = label;
    button.setAttribute("aria-label", label);
    button.disabled = disabled;
    button.addEventListener("click", onClick);
    return button;
}

function renderOptions() {
    if (!state.activeSlot) {
        recipePanel.hidden = true;
        options.replaceChildren();
        return;
    }
    recipePanel.hidden = false;
    const query = search.value.trim().toLocaleLowerCase("nl");
    const selected = selectedIds();
    options.replaceChildren();
    const visible = state.recipes.filter((recipe) => {
        const matchesMeal = state.activeSlot && recipe.category === state.activeSlot.meal;
        const matchesSearch = !query || recipe.title.toLocaleLowerCase("nl").includes(query);
        return recipeIsAvailable(recipe) && matchesMeal && !selected.has(recipe.id) && matchesSearch;
    });
    if (!visible.length) {
        options.append(Object.assign(document.createElement("p"), {
            className: "muted",
            textContent: "Geen recepten gevonden."
        }));
        return;
    }
    visible.forEach((recipe) => {
        const card = document.createElement("article");
        card.className = "recipe-card";
        const title = document.createElement("h3");
        title.textContent = recipe.title;
        const preparationTime = document.createElement("p");
        preparationTime.className = "recipe-card-meta";
        preparationTime.textContent = recipeTimingLabel(recipe);
        const button = document.createElement("button");
        button.type = "button";
        button.className = "button";
        button.textContent = "+";
        button.setAttribute("aria-label", "Toevoegen");
        button.title = "Toevoegen";
        button.addEventListener("click", () => chooseRecipe(recipe));
        card.append(title, preparationTime);
        const note = recipeCardNote(recipe);
        if (note) card.append(note);
        card.append(button);
        options.append(card);
    });
}

function renderSingleRecipeSearch() {
    singleRecipeResults.replaceChildren();
    const query = singleRecipeQuery.value.trim().toLocaleLowerCase("nl");
    const visible = state.recipes.filter((recipe) => recipeIsAvailable(recipe) && (!singleRecipeCategory.value || recipe.category === singleRecipeCategory.value) &&
        (!query || recipe.title.toLocaleLowerCase("nl").includes(query)));
    if (!visible.length) {
        singleRecipeResults.append(Object.assign(document.createElement("p"), {
            className: "muted",
            textContent: "Geen recepten gevonden."
        }));
        return;
    }
    visible.forEach((recipe) => {
        const card = document.createElement("article");
        card.className = "recipe-card";
        const title = document.createElement("h3");
        title.textContent = recipe.title;
        const preparationTime = document.createElement("p");
        preparationTime.className = "recipe-card-meta";
        preparationTime.textContent = recipeTimingLabel(recipe);
        const button = document.createElement("button");
        card.className = "recipe-card single-recipe-card";
        button.type = "button";
        button.className = "single-recipe-pdf-button";
        button.textContent = "PDF downloaden";
        button.addEventListener("click", (event) => {
            event.stopPropagation();
            createSingleRecipePdf(recipe);
        });
        card.append(title, preparationTime);
        const note = recipeCardNote(recipe);
        if (note) card.append(note);
        const pdfArea = document.createElement("div");
        pdfArea.className = "single-recipe-pdf-area";
        pdfArea.append(button);
        card.append(pdfArea);
        card.addEventListener("click", () => openRecipeHtml(recipe));
        singleRecipeResults.append(card);
    });
}

function showSelectionMessage(message) {
    status.textContent = message;
    const notice = document.createElement("div");
    notice.className = "notification notification-warning";
    notice.setAttribute("role", "alert");
    notice.textContent = message;
    notifications.replaceChildren(notice);
    window.setTimeout(() => notice.remove(), 7000);
}

function showUndoMessage(message, onUndo, focusKey) {
    status.textContent = message;
    const notice = document.createElement("div");
    notice.className = "notification notification-info";
    notice.setAttribute("role", "status");
    const text = document.createElement("span");
    text.textContent = message;
    const undoButton = document.createElement("button");
    undoButton.type = "button";
    undoButton.className = "button";
    undoButton.textContent = MESSAGES.undo;
    notice.append(text, undoButton);
    notifications.replaceChildren(notice);
    let timer = null;
    const dismiss = () => {
        const hadFocus = notice.contains(document.activeElement);
        notice.remove();
        if (hadFocus) planner.querySelector(`[data-plan-key="${focusKey}"]`)?.focus();
    };
    const startTimer = () => {
        window.clearTimeout(timer);
        timer = window.setTimeout(dismiss, UNDO_TIMEOUT_MS);
    };
    // The notice stays while the user is on it, so keyboard and screen reader users have time to undo.
    notice.addEventListener("focusin", () => window.clearTimeout(timer));
    notice.addEventListener("focusout", startTimer);
    notice.addEventListener("mouseenter", () => window.clearTimeout(timer));
    notice.addEventListener("mouseleave", startTimer);
    undoButton.addEventListener("click", () => {
        window.clearTimeout(timer);
        notice.remove();
        onUndo();
    });
    startTimer();
    undoButton.focus();
}

function chooseRecipe(recipe) {
    if (!state.activeSlot || selectedIds().has(recipe.id)) return;
    if (!isMultiDay(recipe)) {
        state.plan[planKey(state.activeSlot.day, state.activeSlot.meal)] = {
            recipeId: recipe.id,
            sourceDay: state.activeSlot.day
        };
        finishSelection();
        return;
    }
    const startDay = state.activeSlot.day;
    const days = plannedDays(startDay, recipe.days);
    if (days.length !== (recipe.days || 3)) {
        const validStartDays = DAYS.slice(0, DAYS.length - ((recipe.days || 3) - 1) * 2).map((_, index) => dayName(index)).join(", ");
        showSelectionMessage(recipe.title + " kan alleen worden gestart op: " + validStartDays + ".");
        return;
    }
    const meal = state.activeSlot.meal;
    if (days.some((day) => state.plan[planKey(day, meal)])) {
        showSelectionMessage("Een van de geplande dagen is al gevuld. Kies een andere startdag.");
        return;
    }
    days.forEach((day) => {
        state.plan[planKey(day, meal)] = {recipeId: recipe.id, sourceDay: startDay};
    });
    finishSelection();
}

function fillRandomPlan() {
    MEALS.forEach((meal) => {
        DAYS.forEach((_, day) => {
            if (state.plan[planKey(day, meal)]) return;
            const selected = selectedIds();
            const candidates = shuffleRecipes(state.recipes.filter((recipe) => recipeIsAvailable(recipe) && recipe.category === meal && !selected.has(recipe.id)));
            const recipe = candidates.find((candidate) => {
                if (!isMultiDay(candidate)) return true;
                const days = plannedDays(day, candidate.days);
                return days.length === (candidate.days || 3) && !days.some((plannedDay) => state.plan[planKey(plannedDay, meal)]);
            });
            if (!recipe) return;
            if (isMultiDay(recipe)) {
                plannedDays(day, recipe.days).forEach((plannedDay) => {
                    state.plan[planKey(plannedDay, meal)] = {recipeId: recipe.id, sourceDay: day};
                });
            } else {
                state.plan[planKey(day, meal)] = {recipeId: recipe.id, sourceDay: day};
            }
        });
    });
    savePlan();
    render();
}

function finishSelection() {
    savePlan();
    state.activeSlot = null;
    state.pendingRecipe = null;
    render();
    planner.scrollIntoView({behavior: "smooth", block: "start"});
}

function render() {
    renderPlanner();
    renderOptions();
    singleRecipeSearch.hidden = !shoppingListView.hidden;
    const count = Object.keys(state.plan).length;
    status.textContent = count ? count + " maaltijdmomenten gepland." : "Kies een leeg moment om te beginnen.";
    shoppingListButton.disabled = !count;
    downloadButton.disabled = !count;
    if (!count) {
        state.shoppingWarnings = [];
        shoppingListItems.replaceChildren();
        shoppingListView.hidden = true;
    }
}

function normalizeShoppingUnit(unit) {
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

function normalizeShoppingName(name) {
    return String(name || "").toLocaleLowerCase("nl").trim()
        .replace(/\\bcitroenen\\b/g, "citroen")
        .replace(/\\bcourgettes\\b/g, "courgette")
        .replace(/\\buien\\b/g, "ui")
        .replace(/\\bbouillonblokjes\\b/g, "bouillonblokje")
        .replace(/\\bwortelen\\b/g, "wortel")
        .replace(/\\bpaprika's\\b/g, "paprika");
}

function normalizeShoppingIngredient(ingredient) {
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

function parseAmountRange(amount) {
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

function addIngredientAmounts(first, second) {
    const firstRange = parseAmountRange(first);
    const secondRange = parseAmountRange(second);
    if (!firstRange || !secondRange) return null;
    const min = firstRange.min + secondRange.min;
    const max = firstRange.max + secondRange.max;
    return min === max ? min : `${min}-${max}`;
}

function formatIngredientAmount(amount) {
    const range = parseAmountRange(amount);
    if (!range) return String(amount);
    const roundUp = (value) => Number.isInteger(value) ? value : Math.ceil(value);
    if (range.min === range.max) return String(roundUp(range.min));
    return `${roundUp(range.min)}-${roundUp(range.max)}`;
}

function formatIngredientUnit(unit, amount) {
    const normalized = normalizeShoppingUnit(unit);
    if (normalized !== "el" && normalized !== "tl") return unit;
    const range = parseAmountRange(amount);
    const singular = range && range.min === range.max && range.min <= 1;
    if (normalized === "el") return singular ? "eetlepel" : "eetlepels";
    return singular ? "theelepel" : "theelepels";
}

function copyShoppingIngredient(ingredient, normalizedUnit) {
    return {
        ...ingredient,
        normalizedUnit
    };
}

function aggregateIngredients() {
    const totals = new Map();
    const includedRecipeIds = new Set();
    let flaxCrackerCount = 0;
    let flaxCrackerCountUnknown = false;
    let flaxCrackerComponent = null;
    let granolaComponent = null;
    let nutBreadComponent = null;
    state.shoppingWarnings = [];
    Object.values(state.plan).forEach((item) => {
        if (includedRecipeIds.has(item.recipeId)) return;
        includedRecipeIds.add(item.recipeId);
        const recipe = recipeById(item.recipeId);
        const ingredients = [
            ...(recipe?.ingredients || []),
            ...(recipe?.dailyVariants || []).flatMap((variant) => variant.ingredients || []),
            ...(recipe?.components || [])
                .filter((component) => component.includeInShoppingList !== false &&
                    !["lijnzaadcrackers", "granola", "notenbrood"].includes(component.id))
                .flatMap((component) => component.ingredients || [])
        ];
        const component = recipe?.components?.find((item) => item.id === "lijnzaadcrackers");
        if (component) flaxCrackerComponent ||= component;
        const recipeGranolaComponent = recipe?.components?.find((item) => item.id === "granola");
        if (recipeGranolaComponent) granolaComponent ||= recipeGranolaComponent;
        const recipeNutBreadComponent = recipe?.components?.find((item) => item.id === "notenbrood");
        if (recipeNutBreadComponent) nutBreadComponent ||= recipeNutBreadComponent;
        ingredients.forEach((ingredient) => {
            const isFlaxCracker = /lijnzaad\s*cracker(?:s|\(s\))?/i.test(String(ingredient.raw || "")) ||
                /lijnzaad\s*cracker(?:s|\(s\))?/i.test(String(ingredient.name || ""));
            if (isFlaxCracker) {
                const amount = ingredient.amount;
                const parsed = parseAmountRange(amount);
                if (parsed) flaxCrackerCount += parsed.max;
                else flaxCrackerCountUnknown = true;
            }
            if (ingredient.componentId) return;
            const shoppingIngredient = normalizeShoppingIngredient(ingredient);
            if (shoppingIngredient.name === "water" || SHOPPING_LIST_EXCLUDED_NAMES.has(shoppingIngredient.name)) return;
            const key = normalizeShoppingName(shoppingIngredient.name);
            const unit = normalizeShoppingUnit(shoppingIngredient.unit);
            const mapKey = key + "::" + unit;
            const otherUnitKey = [...totals.keys()].find((existingKey) => existingKey.startsWith(key + "::") && existingKey !== mapKey);
            if (otherUnitKey) {
                const warning = "Controleer de eenheid van " + ingredient.name + ".";
                if (!state.shoppingWarnings.includes(warning)) state.shoppingWarnings.push(warning);
            }
            const existing = totals.get(mapKey);
            if (!existing) {
                totals.set(mapKey, copyShoppingIngredient(shoppingIngredient, unit));
                return;
            }
            if (shoppingIngredient.amount == null) {
                if (existing.amount == null) return;
                state.shoppingWarnings.push("Controleer de hoeveelheid van " + shoppingIngredient.name + ".");
                totals.set(mapKey + "::" + totals.size, copyShoppingIngredient(shoppingIngredient, unit));
                return;
            }
            if (existing.amount == null) {
                totals.set(mapKey + "::" + totals.size, copyShoppingIngredient(shoppingIngredient, unit));
                return;
            }
            const combinedAmount = addIngredientAmounts(existing.amount, shoppingIngredient.amount);
            if (combinedAmount !== null) existing.amount = combinedAmount;
        });
    });
    if (flaxCrackerComponent && (flaxCrackerCount || flaxCrackerCountUnknown)) {
        const batches = Math.max(1, Math.ceil((flaxCrackerCount || flaxCrackerComponent.yield) / flaxCrackerComponent.yield));
        flaxCrackerComponent.ingredients.forEach((ingredient) => {
            const scaled = {
                ...ingredient,
                amount: typeof ingredient.amount === "number" ? ingredient.amount * batches : ingredient.amount
            };
            const shoppingIngredient = normalizeShoppingIngredient(scaled);
            if (shoppingIngredient.name === "water" || SHOPPING_LIST_EXCLUDED_NAMES.has(shoppingIngredient.name)) return;
            const key = normalizeShoppingName(shoppingIngredient.name);
            const unit = normalizeShoppingUnit(shoppingIngredient.unit);
            const mapKey = key + "::" + unit;
            const existing = totals.get(mapKey);
            if (!existing) totals.set(mapKey, copyShoppingIngredient(shoppingIngredient, unit));
            else if (shoppingIngredient.amount != null && existing.amount != null) {
                const combinedAmount = addIngredientAmounts(existing.amount, shoppingIngredient.amount);
                if (combinedAmount !== null) existing.amount = combinedAmount;
            }
        });
    }
    if (granolaComponent) {
        granolaComponent.ingredients.forEach((ingredient) => {
            const shoppingIngredient = normalizeShoppingIngredient(ingredient);
            if (shoppingIngredient.name === "water" || SHOPPING_LIST_EXCLUDED_NAMES.has(shoppingIngredient.name)) return;
            const key = normalizeShoppingName(shoppingIngredient.name);
            const unit = normalizeShoppingUnit(shoppingIngredient.unit);
            const mapKey = key + "::" + unit;
            const existing = totals.get(mapKey);
            if (!existing) totals.set(mapKey, copyShoppingIngredient(shoppingIngredient, unit));
            else if (shoppingIngredient.amount != null && existing.amount != null) {
                const combinedAmount = addIngredientAmounts(existing.amount, shoppingIngredient.amount);
                if (combinedAmount !== null) existing.amount = combinedAmount;
            }
        });
    }
    if (nutBreadComponent) {
        nutBreadComponent.ingredients.forEach((ingredient) => {
            const shoppingIngredient = normalizeShoppingIngredient(ingredient);
            if (shoppingIngredient.name === "water" || SHOPPING_LIST_EXCLUDED_NAMES.has(shoppingIngredient.name)) return;
            const key = normalizeShoppingName(shoppingIngredient.name);
            const unit = normalizeShoppingUnit(shoppingIngredient.unit);
            const mapKey = key + "::" + unit;
            const existing = totals.get(mapKey);
            if (!existing) totals.set(mapKey, copyShoppingIngredient(shoppingIngredient, unit));
            else if (shoppingIngredient.amount != null && existing.amount != null) {
                const combinedAmount = addIngredientAmounts(existing.amount, shoppingIngredient.amount);
                if (combinedAmount !== null) existing.amount = combinedAmount;
            }
        });
    }
    return [...totals.values()];
}

const SHOPPING_CATEGORIES = [
    "Groente en fruit",
    "Zuivel en eieren",
    "Vlees, vis en vleesvervangers",
    "Brood en ontbijt",
    "Diepvries",
    "Kruiden en smaakmakers",
    "Houdbare producten",
    "Overig"
];
const SHOPPING_LIST_EXCLUDED_NAMES = new Set(["deegroller of fles", "muffinbakplaat voor 12 muffins"]);
const APPROVED_OTHER_NAMES = new Set(["bakpapier"]);

function shoppingCategory(item) {
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

function sortedShoppingItems() {
    return aggregateIngredients().sort((a, b) => {
        const categoryDifference = SHOPPING_CATEGORIES.indexOf(shoppingCategory(a)) - SHOPPING_CATEGORIES.indexOf(shoppingCategory(b));
        const optionalDifference = Number(Boolean(a.optional)) - Number(Boolean(b.optional));
        return categoryDifference || optionalDifference || a.name.localeCompare(b.name, "nl");
    });
}

function sortIngredientsForDisplay(ingredients) {
    return [...ingredients].sort((a, b) => Number(Boolean(a.optional)) - Number(Boolean(b.optional)));
}

function formatIngredientLabel(item, includeOptionalPrefix = true) {
    const normalized = normalizeShoppingIngredient(item);
    const displayUnit = formatIngredientUnit(normalized.unit, normalized.amount);
    const amount = normalized.amount == null ? "" : formatIngredientAmount(normalized.amount) + (displayUnit ? " " + displayUnit : "");
    const range = parseAmountRange(normalized.amount);
    const displayName = normalized.name === "ei" && (!range || range.min !== 1 || range.max !== 1) ? "eieren" : normalized.name;
    return (includeOptionalPrefix && normalized.optional ? "optioneel: " : "") + amount + (amount ? " " : "") + displayName;
}

function ingredientLabel(item, includeOptionalPrefix = true) {
    const prefix = includeOptionalPrefix && item.optional ? "optioneel: " : "";
    const main = prefix + String(item.raw || item.name || "");
    const alternatives = (item.alternatives || []).map((alternative) => {
        const alternativePrefix = includeOptionalPrefix && alternative.optional ? "optioneel: " : "";
        return alternativePrefix + String(alternative.raw || alternative.name || "");
    });
    return alternatives.length ? main + " of " + alternatives.join(" of ") : main;
}

function shoppingIngredientLabel(item, includeOptionalPrefix = true) {
    return formatIngredientLabel(item, includeOptionalPrefix);
}

function recipeTimingLabel(recipe) {
    const timing = [];
    if (Number.isFinite(recipe?.preparationTime)) timing.push("Bereiding: circa " + recipe.preparationTime + " minuten");
    if (Number.isFinite(recipe?.ovenTime)) timing.push("Oventijd: circa " + recipe.ovenTime + " minuten");
    return timing.join(" | ");
}

function recipeMetadataLabel(recipe) {
    const metadata = [recipe?.category || "recept", recipe?.portions ? recipe.portions + " personen" : ""].filter(Boolean);
    const timing = recipeTimingLabel(recipe);
    if (timing) metadata.push(timing);
    return metadata.join(" · ");
}

function recipeCardNote(recipe) {
    if (!recipe?.notes?.length) return null;
    const note = document.createElement("p");
    note.className = "recipe-card-meta";
    note.textContent = "Opmerking: " + recipe.notes.join(" ");
    return note;
}

function renderShoppingList() {
    shoppingListItems.replaceChildren();
    let currentCategory = "";
    let requiredList;
    let optionalList;
    const items = sortedShoppingItems();
    items.forEach((item) => {
        const category = shoppingCategory(item);
        if (category !== currentCategory) {
            const heading = document.createElement("h3");
            heading.textContent = category;
            shoppingListItems.append(heading);
            requiredList = null;
            optionalList = null;
            currentCategory = category;
        }
        if (!item.optional && !requiredList) {
            requiredList = document.createElement("ul");
            requiredList.className = "shopping-list";
            shoppingListItems.append(requiredList);
        }
        if (item.optional && !optionalList) {
            const optionalHeading = document.createElement("h4");
            optionalHeading.textContent = "Optioneel";
            shoppingListItems.append(optionalHeading);
            optionalList = document.createElement("ul");
            optionalList.className = "shopping-list";
            shoppingListItems.append(optionalList);
        }
        const row = document.createElement("li");
        const label = document.createElement("label");
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        label.append(checkbox, document.createTextNode(shoppingIngredientLabel(item, false)));
        row.append(label);
        (item.optional ? optionalList : requiredList).append(row);
    });
}

function addWrapped(doc, text, x, y, maxWidth, lineHeight = 6) {
    const lines = doc.splitTextToSize(String(text || ""), maxWidth);
    doc.text(lines, x, y);
    return y + lines.length * lineHeight;
}

function addChecklistItem(doc, text, x, y, maxWidth) {
    doc.rect(x, y - 2.5, 3, 3);
    return addWrapped(doc, text, x + 6, y, maxWidth - 6);
}

function methodSteps(method) {
    return window.recipeMethodSteps(method);
}

function recipeIngredients(recipe) {
    return [
        ...(recipe?.ingredients || []),
        ...(recipe?.dailyVariants || []).flatMap((variant) => variant.ingredients || []),
        ...(recipe?.components || []).flatMap((component) => component.ingredients || [])
    ];
}

function recipeEquipment(recipe) {
    return [
        ...(recipe?.equipment || []),
        ...(recipe?.components || []).flatMap((component) => component.equipment || [])
    ];
}

function recipeMethod(recipe) {
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

function drawWeeklyOverview(doc, margin, width) {
    const links = [];
    const gridTop = 52;
    const labelWidth = 28;
    const dayWidth = (width - margin * 2 - labelWidth) / DAYS.length;
    const headerHeight = 10;
    const rowHeight = 34;
    doc.setTextColor(24, 63, 50);
    doc.setFontSize(24);
    doc.text("Voeding Leeft", margin, 24);
    doc.setFontSize(18);
    doc.text("Mijn weekplanning", margin, 40);
    doc.setFontSize(9);
    doc.setDrawColor(190, 202, 188);
    doc.setFillColor(239, 243, 232);
    doc.rect(margin, gridTop, labelWidth, headerHeight, "FD");
    doc.text("Maaltijd", margin + 2, gridTop + 6);
    DAYS.forEach((day, dayIndex) => {
        const x = margin + labelWidth + dayIndex * dayWidth;
        doc.rect(x, gridTop, dayWidth, headerHeight, "FD");
        doc.text(day, x + dayWidth / 2, gridTop + 6, {align: "center"});
    });
    MEALS.forEach((meal, mealIndex) => {
        const y = gridTop + headerHeight + mealIndex * rowHeight;
        doc.setFillColor(250, 250, 247);
        doc.rect(margin, y, labelWidth, rowHeight, "FD");
        doc.setTextColor(24, 63, 50);
        doc.text(meal[0].toUpperCase() + meal.slice(1), margin + 2, y + 7);
        DAYS.forEach((_, dayIndex) => {
            const x = margin + labelWidth + dayIndex * dayWidth;
            doc.setFillColor(255, 255, 255);
            doc.rect(x, y, dayWidth, rowHeight, "FD");
            const item = state.plan[planKey(dayIndex, meal)];
            if (!item) return;
            const recipe = recipeById(item.recipeId);
            const lines = doc.splitTextToSize(recipe?.title || "Onbekend recept", dayWidth - 4);
            doc.setTextColor(24, 63, 50);
            doc.text(lines.slice(0, 3), x + 2, y + 7);
            links.push({recipeId: item.recipeId, x, y, width: dayWidth, height: rowHeight});
            if (recipe?.multiDay) {
                doc.setFontSize(7);
                doc.setTextColor(70, 80, 70);
                const scheduledDays = Number.isInteger(item.sourceDay) ? plannedDays(item.sourceDay, recipe.days).map((day) => shortDayName(day)).join(", ") : "meerdere dagen";
                doc.text(scheduledDays, x + 2, y + rowHeight - 4);
                doc.setFontSize(9);
            }
        });
    });
    return links;
}

async function createPdf() {
    if (!window.jspdf?.jsPDF) {
        status.textContent = "De PDF-module kon niet worden geladen. Controleer je internetverbinding.";
        return;
    }
    const doc = new window.jspdf.jsPDF({orientation: "landscape", unit: "mm", format: "a4"});
    const margin = 16;
    const width = doc.internal.pageSize.getWidth();
    const height = doc.internal.pageSize.getHeight();
    const overviewLinks = drawWeeklyOverview(doc, margin, width);
    const recipePages = new Map();
    doc.addPage();
    doc.setTextColor(24, 63, 50);
    doc.setFontSize(20);
    doc.text("Boodschappenlijst", margin, 24);
    doc.setFontSize(10);
    let y = 36;
    const shoppingItems = sortedShoppingItems();
    let currentCategory = "";
    shoppingItems.forEach((item) => {
        if (y > height - 25) {
            doc.addPage();
            y = 20;
            currentCategory = "";
        }
        const category = shoppingCategory(item);
        if (category !== currentCategory) {
            doc.setFontSize(12);
            doc.setTextColor(24, 63, 50);
            doc.text(category, margin, y);
            y += 7;
            doc.setFontSize(10);
            doc.setTextColor(40, 45, 40);
            currentCategory = category;
        }
        const displayUnit = formatIngredientUnit(item.unit, item.amount);
        const amount = item.amount == null ? "" : formatIngredientAmount(item.amount) + (displayUnit ? " " + displayUnit : "");
        y = addChecklistItem(doc, amount + (amount ? " " : "") + item.name, margin, y, width - margin * 2);
    });
    for (const dayIndex of DAYS.keys()) {
        for (const meal of MEALS) {
            const item = state.plan[planKey(dayIndex, meal)];
            if (!item) continue;
            const recipe = recipeById(item.recipeId);
            if (!recipe) continue;
            doc.addPage();
            if (!recipePages.has(recipe.id)) recipePages.set(recipe.id, doc.getNumberOfPages());
            doc.setTextColor(24, 63, 50);
            doc.setFont("times", "bold");
            doc.setCharSpace(0);
            doc.setFontSize(14);
            const title = String(recipe.title || "Recept").normalize("NFC").replace(/\s+/g, " ").trim();
            const recipeHeading = dayName(dayIndex) + " · " + meal + " · " + recipe.portions + " personen - " + title;
            y = addWrapped(doc, recipeHeading, margin, 24, width - margin * 2, 7) + 2;
            doc.setFont("helvetica", "normal");
            doc.setFontSize(9);
            doc.setTextColor(70, 80, 70);
            y = addWrapped(doc, recipeTimingLabel(recipe), margin, y, width - margin * 2, 4) + 3;
            const mainIngredients = sortIngredientsForDisplay(recipe.ingredients || []);
            if (mainIngredients.length) {
                doc.setFontSize(12);
                doc.setTextColor(24, 63, 50);
                doc.text("Hoofdrecept · Ingrediënten", margin, y);
                y += 7;
                doc.setFontSize(10);
                doc.setTextColor(40, 45, 40);
                mainIngredients.forEach((ingredient) => {
                    y = addWrapped(doc, "• " + ingredientLabel(ingredient), margin, y, width - margin * 2);
                });
            }
            (recipe.components || []).forEach((component) => {
                y += 4;
                doc.setFontSize(12);
                doc.setTextColor(24, 63, 50);
                doc.text("Subrecept · " + component.title, margin, y);
                y += 7;
                doc.setFontSize(10);
                doc.setTextColor(40, 45, 40);
                if (component.availabilityNote) y = addWrapped(doc, component.availabilityNote, margin, y, width - margin * 2);
                (component.ingredients || []).forEach((ingredient) => {
                    y = addWrapped(doc, "• " + ingredientLabel(ingredient), margin, y, width - margin * 2);
                });
            });
            (recipe.dailyVariants || []).forEach((variant) => {
                y += 4;
                doc.setFontSize(12);
                doc.setTextColor(24, 63, 50);
                doc.text("Variant · " + variant.title, margin, y);
                y += 7;
                doc.setFontSize(10);
                doc.setTextColor(40, 45, 40);
                (variant.ingredients || []).forEach((ingredient) => {
                    y = addWrapped(doc, "• " + ingredientLabel(ingredient), margin, y, width - margin * 2);
                });
            });
            const equipment = recipeEquipment(recipe);
            if (equipment.length) {
                y += 4;
                doc.setFontSize(12);
                doc.setTextColor(24, 63, 50);
                doc.text("Benodigdheden", margin, y);
                y += 7;
                doc.setFontSize(10);
                doc.setTextColor(40, 45, 40);
                equipment.forEach((item) => {
                    y = addWrapped(doc, "• " + item, margin, y, width - margin * 2);
                });
            }
            y += 6;
            doc.setFontSize(12);
            doc.setTextColor(24, 63, 50);
            doc.text("Bereidingswijze", margin, y);
            y += 7;
            doc.setFontSize(10);
            doc.setTextColor(40, 45, 40);
            let stepNumber = 1;
            (recipe.components || []).forEach((component) => {
                doc.setFontSize(12);
                doc.setTextColor(24, 63, 50);
                doc.text("Subrecept · " + component.title, margin, y);
                y += 7;
                doc.setFontSize(10);
                doc.setTextColor(40, 45, 40);
                const componentSteps = methodSteps(component.method || "");
                componentSteps.forEach((step) => {
                    y = addWrapped(doc, `${stepNumber}. ${step}`, margin, y, width - margin * 2, 5);
                    stepNumber += 1;
                    if (y > height - margin) {
                        doc.addPage();
                        y = 20;
                    }
                });
                y += 4;
            });
            if ((recipe.components || []).length) {
                doc.setFontSize(12);
                doc.setTextColor(24, 63, 50);
                doc.text("Hoofdrecept", margin, y);
                y += 7;
                doc.setFontSize(10);
                doc.setTextColor(40, 45, 40);
                methodSteps(recipe.method || "").forEach((step) => {
                    y = addWrapped(doc, /^Tip:/i.test(step) ? step : `${stepNumber}. ${step}`, margin, y, width - margin * 2, 5);
                    if (!/^Tip:/i.test(step)) stepNumber += 1;
                    if (y > height - margin) {
                        doc.addPage();
                        y = 20;
                    }
                });
            } else {
                doc.setFontSize(12);
                doc.setTextColor(24, 63, 50);
                doc.text("Hoofdrecept", margin, y);
                y += 7;
                doc.setFontSize(10);
                doc.setTextColor(40, 45, 40);
                const mainSteps = methodSteps(recipe.method || "Zie het oorspronkelijke receptbestand.");
                mainSteps.forEach((step) => {
                    y = addWrapped(doc, /^Tip:/i.test(step) ? step : `${stepNumber}. ${step}`, margin, y, width - margin * 2, 5);
                    if (!/^Tip:/i.test(step)) stepNumber += 1;
                    if (y > height - margin) {
                        doc.addPage();
                        y = 20;
                    }
                });
            }
            (recipe.dailyVariants || []).forEach((variant) => {
                y += 4;
                doc.setFontSize(12);
                doc.setTextColor(24, 63, 50);
                doc.text("Variant · " + variant.title, margin, y);
                y += 7;
                doc.setFontSize(10);
                doc.setTextColor(40, 45, 40);
                methodSteps(variant.method || "").forEach((step) => {
                    y = addWrapped(doc, /^Tip:/i.test(step) ? step : `${stepNumber}. ${step}`, margin, y, width - margin * 2, 5);
                    if (!/^Tip:/i.test(step)) stepNumber += 1;
                    if (y > height - margin) {
                        doc.addPage();
                        y = 20;
                    }
                });
            });
            if (recipe.notes?.length) {
                y += 5;
                doc.setFontSize(12);
                doc.setTextColor(24, 63, 50);
                doc.text("Opmerking", margin, y);
                y += 7;
                doc.setFontSize(10);
                doc.setTextColor(40, 45, 40);
                recipe.notes.forEach((note) => {
                    y = addWrapped(doc, "• " + note, margin, y, width - margin * 2, 5);
                });
            }
        }
    }
    overviewLinks.forEach((link) => {
        const pageNumber = recipePages.get(link.recipeId);
        if (!pageNumber) return;
        doc.setPage(1);
        doc.link(link.x, link.y, link.width, link.height, {pageNumber});
    });
    doc.save("weekplanning.pdf");
}

function openRecipeHtml(recipe) {
    const dialog = document.querySelector("#recipe-dialog");
    if (!dialog || !recipe) return;
    document.querySelector("#recipe-dialog-title").textContent = recipe.title;
    document.querySelector("#recipe-dialog-meta").textContent = recipeMetadataLabel(recipe);
    const content = document.querySelector("#recipe-dialog-content");
    content.replaceChildren();

    const appendSection = (heading, items, ordered = false) => {
        if (!items?.length) return;
        const section = document.createElement("section");
        section.className = "recipe-dialog-section";
        const title = document.createElement("h3");
        title.textContent = heading;
        const list = document.createElement(ordered ? "ol" : "ul");
        items.forEach((item) => {
            const row = document.createElement("li");
            row.textContent = String(item);
            list.append(row);
        });
        section.append(title, list);
        content.append(section);
    };

    appendSection("Ingrediënten", sortIngredientsForDisplay(recipe.ingredients || []).map(ingredientLabel));
    (recipe.components || []).forEach((component) => {
        const items = [];
        if (component.availabilityNote) items.push(component.availabilityNote);
        items.push(...sortIngredientsForDisplay(component.ingredients || []).map(ingredientLabel));
        appendSection("Subrecept · " + component.title, items);
    });
    (recipe.dailyVariants || []).forEach((variant) => {
        appendSection("Variant · " + variant.title, sortIngredientsForDisplay(variant.ingredients || []).map(ingredientLabel));
    });
    appendSection("Benodigdheden", recipeEquipment(recipe));

    let stepNumber = 1;
    (recipe.components || []).forEach((component) => {
        appendSection("Bereidingswijze · " + component.title,
            methodSteps(component.method || "").map((step) => /^Tip:/i.test(step) ? step : `${stepNumber++}. ${step}`), true);
    });
    if (recipe.method) appendSection("Bereidingswijze" + (recipe.components?.length ? " · Hoofdrecept" : ""),
        methodSteps(recipe.method).map((step) => /^Tip:/i.test(step) ? step : `${stepNumber++}. ${step}`), true);
    (recipe.dailyVariants || []).forEach((variant) => {
        appendSection("Bereidingswijze · Variant · " + variant.title,
            methodSteps(variant.method || "").map((step) => /^Tip:/i.test(step) ? step : `${stepNumber++}. ${step}`), true);
    });
    appendSection("Opmerking", recipe.notes || []);

    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
}

async function createSingleRecipePdf(recipe) {
    if (!window.jspdf?.jsPDF) {
        status.textContent = "De PDF-module kon niet worden geladen. Controleer je internetverbinding.";
        return;
    }
    const doc = new window.jspdf.jsPDF({orientation: "portrait", unit: "mm", format: "a4"});
    const margin = 16;
    const width = doc.internal.pageSize.getWidth();
    const height = doc.internal.pageSize.getHeight();
    let y = 24;
    const ensureSpace = (required = 12) => {
        if (y + required > height - margin) {
            doc.addPage();
            y = margin;
        }
    };
    const addSection = (heading, items, bullet = true) => {
        if (!items.length) return;
        ensureSpace(16);
        doc.setFontSize(12);
        doc.setTextColor(24, 63, 50);
        doc.text(heading, margin, y);
        y += 7;
        doc.setFontSize(10);
        doc.setTextColor(40, 45, 40);
        items.forEach((item) => {
            const lines = doc.splitTextToSize((bullet ? "• " : "") + item, width - margin * 2);
            ensureSpace(lines.length * 5 + 2);
            doc.text(lines, margin, y);
            y += lines.length * 5;
        });
        y += 4;
    };
    const addMethodHeading = (heading) => {
        ensureSpace(16);
        doc.setFontSize(12);
        doc.setTextColor(24, 63, 50);
        doc.text(heading, margin, y);
        y += 7;
        doc.setFontSize(10);
        doc.setTextColor(40, 45, 40);
    };
    let stepNumber = 1;
    const addMethodSteps = (method) => {
        methodSteps(method).forEach((step) => {
            const text = /^Tip:/i.test(step) ? step : stepNumber + ". " + step;
            y = addWrapped(doc, text, margin, y, width - margin * 2, 5);
            if (!/^Tip:/i.test(step)) stepNumber += 1;
            if (y > height - margin) {
                doc.addPage();
                y = margin;
            }
        });
    };
    doc.setTextColor(24, 63, 50);
    doc.setFont("times", "bold");
    doc.setFontSize(18);
    y = addWrapped(doc, recipe.title, margin, y, width - margin * 2, 7) + 3;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(recipeMetadataLabel(recipe), margin, y);
    y += 10;
    addSection("Ingrediënten", sortIngredientsForDisplay(recipe.ingredients || []).map(ingredientLabel));
    (recipe.components || []).forEach((component) => {
        const items = [];
        if (component.availabilityNote) items.push(component.availabilityNote);
        items.push(...sortIngredientsForDisplay(component.ingredients || []).map(ingredientLabel));
        addSection("Subrecept · " + component.title, items);
    });
    (recipe.dailyVariants || []).forEach((variant) => addSection("Variant · " + variant.title, sortIngredientsForDisplay(variant.ingredients || []).map(ingredientLabel)));
    addSection("Benodigdheden", recipeEquipment(recipe));
    if ((recipe.components || []).length || recipe.method || (recipe.dailyVariants || []).length) {
        addMethodHeading("Bereidingswijze");
        if (recipe.components?.length) {
            recipe.components.forEach((component) => {
                addMethodHeading("Subrecept · " + component.title);
                addMethodSteps(component.method || "");
            });
            addMethodHeading("Hoofdrecept");
            addMethodSteps(recipe.method || "");
        } else {
            addMethodHeading("Hoofdrecept");
            addMethodSteps(recipe.method || "Zie het oorspronkelijke receptbestand.");
        }
        (recipe.dailyVariants || []).forEach((variant) => {
            addMethodHeading("Variant · " + variant.title);
            addMethodSteps(variant.method || "");
        });
    }
    addSection("Opmerking", recipe.notes || []);
    doc.save((recipe.id || "recept") + ".pdf");
}

async function loadAppVersion() {
    const response = await fetch("version.txt", {cache: "no-store"});
    if (!response.ok) throw new Error(`Version request failed with status ${response.status}`);
    const version = (await response.text()).trim();
    if (version !== "local" && !VERSION_PATTERN.test(version)) throw new Error("Invalid version file");
    appVersion.textContent = version === "local"
        ? `${MESSAGES.versionLabel}: ${MESSAGES.localVersion}`
        : `${MESSAGES.versionLabel}: ${version}`;
}

loadAppVersion().catch((error) => {
    console.error("Could not load application version.", error);
    appVersion.textContent = MESSAGES.versionUnavailable;
});

if (hasPlanner) {
    document.querySelector("#clear-plan").addEventListener("click", () => {
        state.plan = {};
        savePlan();
        render();
    });
    randomFillButton.addEventListener("click", fillRandomPlan);
    copyMenuLinkButton.addEventListener("click", copyMenuLink);
    search.addEventListener("input", renderOptions);
    singleRecipeCategory.addEventListener("change", renderSingleRecipeSearch);
    singleRecipeQuery.addEventListener("input", renderSingleRecipeSearch);
    shoppingListButton.addEventListener("click", () => {
        renderShoppingList();
        shoppingListView.hidden = false;
        singleRecipeSearch.hidden = true;
        shoppingListView.scrollIntoView({behavior: "smooth", block: "start"});
    });
    downloadButton.addEventListener("click", createPdf);
    document.querySelector("#recipe-dialog-close")?.addEventListener("click", () => {
        document.querySelector("#recipe-dialog")?.close();
    });

    fetch("recipes.json")
        .then((response) => response.ok ? response.json() : Promise.reject(new Error("recipes")))
        .then((recipes) => {
            state.recipes = shuffleRecipes(attachSharedRecipeComponents(recipes).map(addPreparationTime));
            state.plan = resolvePlanRecipeTokens(state.plan, state.recipes);
            render();
            renderSingleRecipeSearch();
        })
        .catch(() => {
            status.textContent = "De recepten konden niet worden geladen.";
            render();
        });
}
