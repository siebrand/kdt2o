import {MESSAGES} from "./messages.js";
import {createPdf, createSingleRecipePdf} from "./pdf.js";
import {DAYS, MEALS, PLAN_STORAGE_KEY, PLAN_STORAGE_VERSION, compactPlan, dayName, encodeBase64Url, isMultiDay, planKey, planKeyMeal, plannedDays, resolvePlanRecipeTokens, shortDayName} from "./plan.js";
import {nearestMove, planSelectionMove} from "./planning.js";
import {addPreparationTime, attachSharedRecipeComponents, ingredientLabel, methodSteps, recipeEquipment, recipeIsAvailable, recipeMetadataLabel, recipeSourceUrl, recipeTimingLabel, recipeVariantForDay, shuffleRecipes, sortIngredientsForDisplay} from "./recipes.js";
import {shoppingCategory, shoppingIngredientLabel} from "./shopping.js";
import {downloadJson, planShoppingListDocument} from "./shopping-export.js";
import {currentShoppingItems, recipeById, state} from "./state.js";

const UNDO_TIMEOUT_MS = 10000;
const VERSION_PATTERN = /^[0-9]{4}-[0-9]{2}-[0-9]{2}\.[0-9]{12,}-[0-9a-f]{40}$/;
const hasPlanner = document.querySelector("#planner") !== null;

const planner = document.querySelector("#planner");
const todayButton = document.querySelector("#jump-to-today");
if (todayButton) todayButton.textContent = MESSAGES.today;
const options = document.querySelector("#recipe-options");
const status = document.querySelector("#status");
const search = document.querySelector("#search");
const randomFillButton = document.querySelector("#random-fill");
const copyMenuLinkButton = document.querySelector("#copy-menu-link");
const singleRecipeCategory = document.querySelector("#single-recipe-category");
const singleRecipeQuery = document.querySelector("#single-recipe-query");
const singleRecipeResults = document.querySelector("#single-recipe-results");
const downloadButton = document.querySelector("#download-pdf");
const downloadShoppingListButton = document.querySelector("#download-shopping-list");
const shoppingListButton = document.querySelector("#show-shopping-list");
const shoppingListView = document.querySelector("#shopping-list-view");
const singleRecipeSearch = document.querySelector("#single-recipe-search");
const shoppingListItems = document.querySelector("#shopping-list-items");
const notifications = document.querySelector("#notifications");
const recipePanel = document.querySelector("#recipe-panel");
const appVersion = document.querySelector("#app-version");
const recipeDialog = document.querySelector("#recipe-dialog");
const cookingModeButton = document.querySelector("#cooking-mode-toggle");
const cookingModeStatus = document.querySelector("#cooking-mode-status");
const cookingMode = {enabled: false, wakeLock: null, requestPending: false};
const dragState = {sourceKey: null};
// The version that loadAppVersion() read: a CalVer version, "local", or null while unknown.
let appVersionId = null;

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
    showSelectionMessage(MESSAGES.menuLinkCopied);
}

function savePlan() {
    localStorage.setItem(PLAN_STORAGE_KEY, JSON.stringify({
        version: PLAN_STORAGE_VERSION,
        plan: compactPlan(state.plan)
    }));
    removeShareLink();
}

// Once the plan is saved, a share link in the address bar would undo the changes on reload. Only opening a link saves
// nothing, so until the first change the link stays and the visitor keeps the own saved plan.
function removeShareLink() {
    if (!new URLSearchParams(window.location.hash.slice(1)).has("plan")) return;
    history.replaceState(history.state, "", window.location.pathname + window.location.search);
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
    showUndoMessage(MESSAGES.recipeRemoved(recipeById(item.recipeId)?.title || MESSAGES.unknownRecipe), () => {
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

function selectedIds() {
    return new Set(Object.values(state.plan).filter(Boolean).map((item) => item.recipeId));
}

function renderPlanner() {
    planner.replaceChildren();
    planner.append(Object.assign(document.createElement("div"), {
        className: "planner-cell day",
        textContent: MESSAGES.mealColumn
    }));
    MEALS.forEach((meal) => planner.append(Object.assign(document.createElement("div"), {
        className: "planner-cell meal-label",
        textContent: meal[0].toUpperCase() + meal.slice(1)
    })));

    DAYS.forEach((day, dayIndex) => {
        const dayGroup = document.createElement("div");
        dayGroup.className = "planner-day";
        dayGroup.setAttribute("role", "group");
        dayGroup.setAttribute("aria-label", day);
        dayGroup.append(Object.assign(document.createElement("div"), {
            className: "planner-cell day",
            textContent: day
        }));

        MEALS.forEach((meal) => {
            const cell = document.createElement("div");
            cell.className = "planner-cell";
            cell.dataset.meal = meal;
            cell.setAttribute("role", "group");
            cell.setAttribute("aria-label", `${meal[0].toUpperCase() + meal.slice(1)} ${day}`);
            const mealLabel = document.createElement("span");
            mealLabel.className = "planner-meal-name";
            mealLabel.textContent = meal[0].toUpperCase() + meal.slice(1);
            cell.append(mealLabel);
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
                const recipeTitle = recipe?.title || MESSAGES.unknownRecipe;
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
                    notice.textContent = MESSAGES.advanceNotice(recipe.advanceNotice);
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
                slot.textContent = MESSAGES.chooseRecipe;
                slot.addEventListener("click", () => {
                    state.activeSlot = {day: dayIndex, meal};
                    renderOptions();
                    document.querySelector("#recipe-title").scrollIntoView({behavior: "smooth", block: "start"});
                });
            }
            cell.append(slot);
            dayGroup.append(cell);
        });
        planner.append(dayGroup);
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
        const matchesMeal = state.activeSlot && recipe.categories.includes(state.activeSlot.meal);
        const matchesSearch = !query || recipe.title.toLocaleLowerCase("nl").includes(query);
        return recipeIsAvailable(recipe) && matchesMeal && !selected.has(recipe.id) && matchesSearch;
    });
    if (!visible.length) {
        options.append(Object.assign(document.createElement("p"), {
            className: "muted",
            textContent: MESSAGES.noRecipesFound
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
        button.setAttribute("aria-label", MESSAGES.addRecipe);
        button.title = MESSAGES.addRecipe;
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
    const visible = state.recipes.filter((recipe) => recipeIsAvailable(recipe) && (!singleRecipeCategory.value || recipe.categories.includes(singleRecipeCategory.value)) &&
        (!query || recipe.title.toLocaleLowerCase("nl").includes(query)));
    if (!visible.length) {
        singleRecipeResults.append(Object.assign(document.createElement("p"), {
            className: "muted",
            textContent: MESSAGES.noRecipesFound
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
        button.textContent = MESSAGES.downloadPdf;
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
        showSelectionMessage(MESSAGES.validStartDays(recipe.title, validStartDays));
        return;
    }
    const meal = state.activeSlot.meal;
    if (days.some((day) => state.plan[planKey(day, meal)])) {
        showSelectionMessage(MESSAGES.plannedDayTaken);
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
            const candidates = shuffleRecipes(state.recipes.filter((recipe) => recipeIsAvailable(recipe) && recipe.categories.includes(meal) && !selected.has(recipe.id)));
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
    status.textContent = count ? MESSAGES.plannedCount(count) : MESSAGES.emptyPlan;
    shoppingListButton.disabled = !count;
    downloadButton.disabled = !count;
    downloadShoppingListButton.disabled = !count;
    if (!count) {
        state.shoppingWarnings = [];
        shoppingListItems.replaceChildren();
        shoppingListView.hidden = true;
    }
}

function recipeCardNote(recipe) {
    if (!recipe?.notes?.length) return null;
    const note = document.createElement("p");
    note.className = "recipe-card-meta";
    note.textContent = MESSAGES.notePrefix(recipe.notes.join(" "));
    return note;
}

function renderShoppingList() {
    shoppingListItems.replaceChildren();
    let currentCategory = "";
    let requiredList;
    let optionalList;
    const items = currentShoppingItems();
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
            optionalHeading.textContent = MESSAGES.optionalHeading;
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

function downloadShoppingList() {
    const document_ = planShoppingListDocument(state.plan, state.recipes, {version: appVersionId});
    downloadJson(document_, MESSAGES.shoppingListFilename);
}

function updateCookingModeControls(message) {
    if (!cookingModeButton || !cookingModeStatus) return;
    cookingModeButton.textContent = cookingMode.enabled ? MESSAGES.cookingModeDisable : MESSAGES.cookingModeEnable;
    cookingModeButton.setAttribute("aria-pressed", String(cookingMode.enabled));
    if (message) cookingModeStatus.textContent = message;
}

async function acquireCookingWakeLock() {
    if (!cookingMode.enabled || !recipeDialog?.open || document.visibilityState !== "visible"
        || cookingMode.wakeLock || cookingMode.requestPending) return;
    if (!navigator.wakeLock?.request) {
        cookingMode.enabled = false;
        updateCookingModeControls(MESSAGES.cookingModeUnsupported);
        return;
    }

    cookingMode.requestPending = true;
    try {
        const wakeLock = await navigator.wakeLock.request("screen");
        if (!cookingMode.enabled || !recipeDialog.open || document.visibilityState !== "visible") {
            await wakeLock.release();
            return;
        }
        cookingMode.wakeLock = wakeLock;
        updateCookingModeControls(MESSAGES.cookingModeActive);
        wakeLock.addEventListener("release", () => {
            if (cookingMode.wakeLock !== wakeLock) return;
            cookingMode.wakeLock = null;
            if (cookingMode.enabled) {
                cookingModeStatus.textContent = document.visibilityState === "visible"
                    ? MESSAGES.cookingModeInterrupted
                    : MESSAGES.cookingModeResumesWhenVisible;
            }
        }, {once: true});
    } catch (error) {
        console.error("Could not acquire the screen wake lock.", error);
        if (cookingMode.enabled) {
            cookingMode.enabled = false;
            updateCookingModeControls(error.name === "NotAllowedError"
                ? MESSAGES.cookingModeDenied
                : MESSAGES.cookingModeFailed);
        }
    } finally {
        cookingMode.requestPending = false;
        if (cookingMode.enabled && recipeDialog?.open && document.visibilityState === "visible" && !cookingMode.wakeLock) {
            queueMicrotask(() => acquireCookingWakeLock());
        }
    }
}

function disableCookingMode(message = MESSAGES.cookingModeOff) {
    cookingMode.enabled = false;
    const wakeLock = cookingMode.wakeLock;
    cookingMode.wakeLock = null;
    updateCookingModeControls(message);
    if (wakeLock) {
        wakeLock.release().catch((error) => console.error("Could not release the screen wake lock.", error));
    }
}

function openRecipeHtml(recipe) {
    const dialog = document.querySelector("#recipe-dialog");
    if (!dialog || !recipe) return;
    document.querySelector("#recipe-dialog-title").textContent = recipe.title;
    document.querySelector("#recipe-dialog-meta").textContent = recipeMetadataLabel(recipe);
    const content = document.querySelector("#recipe-dialog-content");
    content.replaceChildren();

    const appendSection = (heading, items) => {
        if (!items?.length) return;
        const section = document.createElement("section");
        section.className = "recipe-dialog-section";
        const title = document.createElement("h3");
        title.textContent = heading;
        const list = document.createElement("ul");
        items.forEach((item) => {
            const row = document.createElement("li");
            row.textContent = String(item);
            list.append(row);
        });
        section.append(title, list);
        content.append(section);
    };

    appendSection(MESSAGES.ingredients, sortIngredientsForDisplay(recipe.ingredients || []).map(ingredientLabel));
    (recipe.components || []).forEach((component) => {
        const items = [];
        if (component.availabilityNote) items.push(component.availabilityNote);
        items.push(...sortIngredientsForDisplay(component.ingredients || []).map(ingredientLabel));
        appendSection(MESSAGES.subrecipe(component.title), items);
    });
    (recipe.dailyVariants || []).forEach((variant) => {
        appendSection(MESSAGES.variant(variant.title), sortIngredientsForDisplay(variant.ingredients || []).map(ingredientLabel));
    });
    appendSection(MESSAGES.equipment, recipeEquipment(recipe));

    // Steps are numbered across all method sections, as in the PDF. The list draws the number from each item's value,
    // so the step text has no number of its own; tips get no number.
    let stepNumber = 1;
    const appendMethodSection = (heading, method) => {
        const steps = methodSteps(method || "");
        if (!steps.length) return;
        const section = document.createElement("section");
        section.className = "recipe-dialog-section";
        const title = document.createElement("h3");
        title.textContent = heading;
        const list = document.createElement("ol");
        steps.forEach((step) => {
            const row = document.createElement("li");
            row.textContent = step;
            if (/^Tip:/i.test(step)) row.className = "recipe-tip";
            else row.value = stepNumber++;
            list.append(row);
        });
        section.append(title, list);
        content.append(section);
    };
    (recipe.components || []).forEach((component) => {
        appendMethodSection(MESSAGES.methodOf(component.title), component.method);
    });
    appendMethodSection(recipe.components?.length ? MESSAGES.methodOf(MESSAGES.mainRecipe) : MESSAGES.method, recipe.method);
    (recipe.dailyVariants || []).forEach((variant) => {
        appendMethodSection(MESSAGES.methodOf(MESSAGES.variant(variant.title)), variant.method);
    });
    appendSection(MESSAGES.note, recipe.notes || []);
    const sourceUrl = recipeSourceUrl(recipe);
    if (sourceUrl) {
        const source = document.createElement("p");
        source.className = "recipe-dialog-source";
        const link = document.createElement("a");
        link.href = sourceUrl;
        link.rel = "noopener noreferrer";
        link.target = "_blank";
        link.textContent = recipe.source.name;
        source.append(MESSAGES.sourcePrefix, link);
        content.append(source);
    }

    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
}

async function loadAppVersion() {
    const response = await fetch("version.txt", {cache: "no-store"});
    if (!response.ok) throw new Error(`Version request failed with status ${response.status}`);
    const version = (await response.text()).trim();
    if (version !== "local" && !VERSION_PATTERN.test(version)) throw new Error("Invalid version file");
    appVersionId = version;
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
    downloadShoppingListButton.addEventListener("click", downloadShoppingList);
    todayButton?.addEventListener("click", () => {
        const todayIndex = (new Date().getDay() + 6) % DAYS.length;
        planner.querySelectorAll(".planner-day")[todayIndex].scrollIntoView({behavior: "smooth", block: "start"});
    });
    document.querySelector("#recipe-dialog-close")?.addEventListener("click", () => {
        recipeDialog?.close();
    });
    cookingModeButton?.addEventListener("click", () => {
        if (cookingMode.enabled) {
            disableCookingMode();
            return;
        }
        cookingMode.enabled = true;
        updateCookingModeControls(MESSAGES.cookingModeStarting);
        void acquireCookingWakeLock();
    });
    recipeDialog?.addEventListener("close", () => disableCookingMode());
    document.addEventListener("visibilitychange", () => {
        if (!cookingMode.enabled) return;
        if (document.visibilityState === "visible") {
            if (cookingMode.wakeLock?.released) cookingMode.wakeLock = null;
            cookingModeStatus.textContent = MESSAGES.cookingModeResuming;
            void acquireCookingWakeLock();
        } else {
            cookingModeStatus.textContent = MESSAGES.cookingModeResumesWhenVisible;
        }
    });

    // Revalidate, so a cached recipes.json never outlives a deployment of new code.
    fetch("recipes.json", {cache: "no-cache"})
        .then((response) => response.ok ? response.json() : Promise.reject(new Error("recipes")))
        .then((recipes) => {
            state.recipes = shuffleRecipes(attachSharedRecipeComponents(recipes).map(addPreparationTime));
            state.plan = resolvePlanRecipeTokens(state.plan, state.recipes);
            render();
            renderSingleRecipeSearch();
        })
        .catch(() => {
            status.textContent = MESSAGES.recipesLoadFailed;
            render();
        });
}
