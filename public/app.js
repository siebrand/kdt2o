const DAYS = ["Maandag", "Dinsdag", "Woensdag", "Donderdag", "Vrijdag", "Zaterdag", "Zondag"];
const MEALS = ["ontbijt", "lunch", "diner"];
const PLAN_STORAGE_KEY = "kitano-weekplan";
const PLAN_STORAGE_VERSION = 2;
const state = { recipes: [], plan: loadPlan(), activeSlot: null, pendingRecipe: null, shoppingWarnings: [] };

const planner = document.querySelector("#planner");
const options = document.querySelector("#recipe-options");
const status = document.querySelector("#status");
const search = document.querySelector("#search");
const downloadButton = document.querySelector("#download-pdf");
const shoppingListButton = document.querySelector("#show-shopping-list");
const shoppingListView = document.querySelector("#shopping-list-view");
const shoppingListItems = document.querySelector("#shopping-list-items");
const notifications = document.querySelector("#notifications");
const recipePanel = document.querySelector("#recipe-panel");
const includeInfographicsToggle = document.querySelector("#include-infographics");
if (includeInfographicsToggle) includeInfographicsToggle.checked = false;

function loadPlan() {
  try {
    const saved = JSON.parse(localStorage.getItem(PLAN_STORAGE_KEY) || "null");
    if (saved?.version !== PLAN_STORAGE_VERSION || !saved.plan || typeof saved.plan !== "object") return {};
    return saved.plan;
  } catch {
    return {};
  }
}

function savePlan() {
  localStorage.setItem(PLAN_STORAGE_KEY, JSON.stringify({ version: PLAN_STORAGE_VERSION, plan: state.plan }));
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
  return { ...recipe, preparationTime: estimatePreparationTime(recipe), preparationTimeEstimated: true };
}

function attachSharedRecipeComponents(recipes) {
  const flaxTemplate = recipes.find((recipe) => recipe.components?.some((component) => component.id === "lijnzaadcrackers"));
  const granolaTemplate = recipes.find((recipe) => recipe.components?.some((component) => component.id === "granola"));
  if (!flaxTemplate && !granolaTemplate) return recipes;
  const flaxComponent = flaxTemplate?.components.find((item) => item.id === "lijnzaadcrackers");
  const granolaComponent = granolaTemplate?.components.find((item) => item.id === "granola");
  return recipes.map((recipe) => {
    const components = [...(recipe.components || [])];
    if (flaxComponent && /lijnzaad\s*cracker(?:s|\(s\))?/i.test(JSON.stringify(recipe)) && !components.some((item) => item.id === "lijnzaadcrackers")) {
      components.push({ ...flaxComponent, ingredients: flaxComponent.ingredients.map((ingredient) => ({ ...ingredient })), equipment: [...(flaxComponent.equipment || [])] });
    }
    if (granolaComponent && /granola/i.test(JSON.stringify(recipe)) && !components.some((item) => item.id === "granola")) {
      components.push({ ...granolaComponent, ingredients: granolaComponent.ingredients.map((ingredient) => ({ ...ingredient })), equipment: [...(granolaComponent.equipment || [])] });
    }
    return components.length === (recipe.components || []).length ? recipe : { ...recipe, components };
  });
}

function selectedIds() {
  return new Set(Object.values(state.plan).filter(Boolean).map((item) => item.recipeId));
}

function isMultiDay(recipe) {
  return Boolean(recipe.multiDay);
}

function plannedDays(startDay, dayCount = 3) {
  return Array.from({ length: dayCount }, (_, index) => startDay + index * 2).filter((day) => day < DAYS.length);
}

function renderPlanner() {
  planner.replaceChildren();
  planner.append(Object.assign(document.createElement("div"), { className: "planner-cell day", textContent: "Maaltijd" }));
  DAYS.forEach((day) => planner.append(Object.assign(document.createElement("div"), { className: "planner-cell day", textContent: day })));
  MEALS.forEach((meal) => {
    planner.append(Object.assign(document.createElement("div"), { className: "planner-cell meal-label", textContent: meal[0].toUpperCase() + meal.slice(1) }));
    DAYS.forEach((_, dayIndex) => {
      const cell = document.createElement("div");
      cell.className = "planner-cell";
      const slot = document.createElement("button");
      slot.type = "button";
      slot.className = "slot";
      const item = state.plan[planKey(dayIndex, meal)];
      if (item) {
        const recipe = recipeById(item.recipeId);
        slot.innerHTML = "";
        const title = document.createElement("strong");
        title.textContent = recipe?.title || "Onbekend recept";
        const detail = document.createElement("small");
        detail.textContent = "Klik om te verwijderen";
        slot.append(title, detail);
        if (recipe?.multiDay) {
          const schedule = document.createElement("small");
          schedule.textContent = plannedDays(item.sourceDay, recipe.days).map((day) => shortDayName(day)).join(", ");
          slot.append(schedule);
        }
        if (recipe?.advanceNotice) {
          const notice = document.createElement("small");
          notice.textContent = "Let op: " + recipe.advanceNotice;
          slot.append(notice);
        }
        slot.addEventListener("click", () => {
          Object.entries(state.plan).forEach(([key, plannedItem]) => {
            if (plannedItem.recipeId === item.recipeId) delete state.plan[key];
          });
          savePlan();
          render();
        });
      } else {
        slot.textContent = "+ Recept kiezen";
        slot.addEventListener("click", () => {
          state.activeSlot = { day: dayIndex, meal };
          renderOptions();
          document.querySelector("#recipe-title").scrollIntoView({ behavior: "smooth", block: "start" });
        });
      }
      cell.append(slot);
      planner.append(cell);
    });
  });
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
    return matchesMeal && !selected.has(recipe.id) && matchesSearch;
  });
  if (!visible.length) {
    options.append(Object.assign(document.createElement("p"), { className: "muted", textContent: "Geen recepten gevonden." }));
    return;
  }
  visible.forEach((recipe) => {
    const card = document.createElement("article");
    card.className = "recipe-card";
    const preview = document.createElement("img");
    preview.className = "recipe-card-image";
    preview.src = svgDataUrl(infographicSvg(recipe));
    preview.alt = "Infographic van " + recipe.title;
    const title = document.createElement("h3");
    title.textContent = recipe.title;
    const preparationTime = document.createElement("p");
    preparationTime.className = "recipe-card-meta";
    preparationTime.textContent = "Bereiding: circa " + recipe.preparationTime + " minuten" +
       (Number.isFinite(recipe.ovenTime) ? " | Oventijd: circa " + recipe.ovenTime + " minuten" : "");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "button";
    button.textContent = "+";
    button.setAttribute("aria-label", "Toevoegen");
    button.title = "Toevoegen";
    button.addEventListener("click", () => chooseRecipe(recipe));
    card.append(preview, title, preparationTime, button);
    options.append(card);
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

function chooseRecipe(recipe) {
  if (!state.activeSlot || selectedIds().has(recipe.id)) return;
  if (!isMultiDay(recipe)) {
    state.plan[planKey(state.activeSlot.day, state.activeSlot.meal)] = { recipeId: recipe.id, sourceDay: state.activeSlot.day };
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
  days.forEach((day) => { state.plan[planKey(day, meal)] = { recipeId: recipe.id, sourceDay: startDay }; });
  finishSelection();
}

function finishSelection() {
  savePlan();
  state.activeSlot = null;
  state.pendingRecipe = null;
  render();
  planner.scrollIntoView({ behavior: "smooth", block: "start" });
}

function render() {
  renderPlanner();
  renderOptions();
  const count = Object.keys(state.plan).length;
  status.textContent = count ? count + " maaltijdmomenten gepland." : "Kies een leeg moment om te beginnen.";
  shoppingListButton.disabled = !count;
  downloadButton.disabled = !count;
}

function normalizeShoppingUnit(unit) {
  const value = String(unit || "").toLocaleLowerCase("nl");
  const aliases = { g: "gram", gr: "gram", gram: "gram", ml: "ml", milliliter: "ml", stuks: "stuk", stuk: "stuk", eetlepel: "el", eetlepels: "el", theelepel: "tl", theelepels: "tl" };
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
  if (name === "water") return { ...ingredient, amount: null, unit: "", name: "water", key: "water" };
  if (name === "ei" || name === "eieren") return { ...ingredient, amount: ingredient.amount, unit: "stuk", name: "ei", key: "ei" };
  if (name === "halve komkommer" || raw === "halve komkommer") {
    return { ...ingredient, amount: 0.5, unit: "stuk", name: "komkommer", key: "komkommer" };
  }
  if (/^(?:plakjes|schijfjes) komkommer$/.test(name)) {
    return { ...ingredient, name: "komkommer", key: "komkommer" };
  }
  if (raw.startsWith("1/, ")) raw = "1/2 " + raw.slice(4);
  if (name.includes("roomboter")) {
    return { ...ingredient, amount: ingredient.amount ?? 1, unit: "el", name: "roomboter" };
  }
  const descriptiveMeasures = [
    { pattern: /^(?:een )?scheut(?:je)? (.+)$/, amount: 1, unit: "el" },
    { pattern: /^snufje (.+)$/, amount: 1, unit: "tl" },
    { pattern: /^mespunt (.+)$/, amount: 0.25, unit: "tl" },
    { pattern: /^(?:een )?handje (.+)$/, amount: 1, unit: "hand" },
    { pattern: /^handvol (.+)$/, amount: 1, unit: "hand" },
    { pattern: /^paar takjes (.+)$/, amount: 2, unit: "takje" },
    { pattern: /^takje (.+)$/, amount: 1, unit: "takje" },
    { pattern: /^half bosje (.+)$/, amount: 0.5, unit: "bosje" }
  ];
  const descriptive = descriptiveMeasures.find((measure) => measure.pattern.test(name));
  if (descriptive) {
    return { ...ingredient, amount: descriptive.amount, unit: descriptive.unit, name: name.replace(descriptive.pattern, "$1") };
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
    return { ...ingredient, amount: 0.5, unit, name: rest };
  }
  const startsWithNumber = raw.length > 0 && raw[0] >= "0" && raw[0] <= "9";
  if (ingredient.amount != null && !ingredient.unit && startsWithNumber) {
    return { ...ingredient, unit: "stuk" };
  }
  return ingredient;
}

function parseAmountRange(amount) {
  if (typeof amount === "number" && Number.isFinite(amount)) return { min: amount, max: amount };
  const value = String(amount ?? "").trim();
  const fraction = value.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (fraction && Number(fraction[2]) !== 0) {
    const result = Number(fraction[1]) / Number(fraction[2]);
    return { min: result, max: result };
  }
  const match = value.match(/^(\d+(?:[.,]\d+)?)\s*-\s*(\d+(?:[.,]\d+)?)$/);
  if (!match) return null;
  return { min: Number(match[1].replace(",", ".")), max: Number(match[2].replace(",", ".")) };
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
    alternatives: ingredient.alternatives?.map((alternative) => ({ ...alternative })),
    normalizedUnit
  };
}

function aggregateIngredientAlternatives(existing, incoming) {
  if (!incoming.alternatives?.length) return;
  if (!existing.alternatives) {
    existing.alternatives = incoming.alternatives.map((alternative) => ({ ...alternative }));
    return;
  }
  incoming.alternatives.forEach((incomingAlternative) => {
    const incomingUnit = normalizeShoppingUnit(incomingAlternative.unit);
    const incomingKey = normalizeShoppingName(incomingAlternative.name);
    const existingAlternative = existing.alternatives.find((alternative) =>
      normalizeShoppingUnit(alternative.unit) === incomingUnit &&
      normalizeShoppingName(alternative.name) === incomingKey
    );
    if (!existingAlternative) {
      existing.alternatives.push({ ...incomingAlternative });
      return;
    }
    const combinedAmount = addIngredientAmounts(existingAlternative.amount, incomingAlternative.amount);
    if (combinedAmount !== null) existingAlternative.amount = combinedAmount;
  });
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
    const ingredients = recipe?.ingredients || [];
    const component = recipe?.components?.find((item) => item.id === "lijnzaadcrackers");
    if (component) flaxCrackerComponent ||= component;
    const recipeGranolaComponent = recipe?.components?.find((item) => item.id === "granola");
    if (recipeGranolaComponent) granolaComponent ||= recipeGranolaComponent;
    const recipeNutBreadComponent = recipe?.components?.find((item) => item.id === "notenbrood");
    if (recipeNutBreadComponent) nutBreadComponent ||= recipeNutBreadComponent;
    ingredients.forEach((ingredient) => {
      const isFlaxCracker = /lijnzaad\s*cracker(?:s|\(s\))?/i.test(String(ingredient.raw || "")) ||
        /lijnzaad\s*cracker(?:s|\(s\))?/i.test(String(ingredient.name || "")) ||
        (ingredient.alternatives || []).some((alternative) => /lijnzaad\s*cracker(?:s|\(s\))?/i.test(String(alternative.raw || alternative.name || "")));
      if (isFlaxCracker) {
        const amount = ingredient.amount ?? ingredient.alternatives?.find((alternative) => /lijnzaad\s*cracker/i.test(String(alternative.name || "")))?.amount;
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
      aggregateIngredientAlternatives(existing, shoppingIngredient);
    });
  });
  if (flaxCrackerComponent && (flaxCrackerCount || flaxCrackerCountUnknown)) {
    const batches = Math.max(1, Math.ceil((flaxCrackerCount || flaxCrackerComponent.yield) / flaxCrackerComponent.yield));
    flaxCrackerComponent.ingredients.forEach((ingredient) => {
      const scaled = { ...ingredient, amount: typeof ingredient.amount === "number" ? ingredient.amount * batches : ingredient.amount };
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
  const name = String(item.name || "").toLocaleLowerCase("nl");
  const has = (...terms) => terms.some((term) => name.includes(term));
  const hasWord = (...terms) => terms.some((term) => new RegExp(`(^|[^a-z])${term}($|[^a-z])`).test(name));

  if (has("diepvries", "bevroren")) return "Diepvries";
  if (has("kokosmelk", "bouillon", "zongedroogde", "olijf", "olijven", "kelp")) return "Houdbare producten";
  if (has("wortel", "courgette", "paprika", "tomaat", "tomaten", "cherry tom", "komkommer", "biet", "avocado", "broccoli", "bloemkool", "spinazie", "sla", "rucola", "andijvie", "aubergine", "augurk", "bleekselderij", "venkel", "mais", "mandarijn", "champignon", "knoflook", "gember", "citroen", "limoen", "appel", "banaan", "aardbei", "framboos", "bosbes", "blauwe bes", "mango", "peer", "druif", "fruit", "kikkererwt", "erwt", "snijboon", "witlof", "lenteui", "bosui", "prei", "preien", "spruit", "taugé", "knolselderij", "pastinaak", "zuurkool") || hasWord("ui", "uien")) return "Groente en fruit";
  if (has("yoghurt", "kwark", "melk", "kaas", "feta", "ricotta", "mozzarella", "hüttenkäse", "huttenkase", "boter", "room", "crême", "crème", "creme", "fraiche", "fraîche") || hasWord("ei", "eieren")) return "Zuivel en eieren";
  if (has("kip", "rund", "gehakt", "spek", "ham", "zalm", "tonijn", "vis", "pangasius", "haring", "biefstuk", "tartaar", "tofu", "tempeh")) return "Vlees, vis en vleesvervangers";
  if (has("brood", "cracker", "havermout", "muesli", "granola")) return "Brood en ontbijt";
  if (has("zout", "peper", "kaneel", "kruiden", "oregano", "basilicum", "komijn", "kerrie", "paprikapoeder", "salie", "peterselie", "dille", "koriander", "bieslook", "chilipoeder", "chilivlokken", "kurkuma", "spices")) return "Kruiden en smaakmakers";
  if (has("pasta", "rijst", "quinoa", "couscous", "linzen", "bonen", "noten", "amandel", "zaad", "pitten", "olie", "azijn", "meel", "bloem", "bakpoeder", "cacao", "chocolade", "pindakaas", "honing", "kokos", "mayonaise", "sojasaus", "mosterd", "pesto", "kokosmelk")) return "Houdbare producten";
  return "Overig";
}

function sortedShoppingItems() {
  return aggregateIngredients().sort((a, b) => {
    const categoryDifference = SHOPPING_CATEGORIES.indexOf(shoppingCategory(a)) - SHOPPING_CATEGORIES.indexOf(shoppingCategory(b));
    return categoryDifference || a.name.localeCompare(b.name, "nl");
  });
}

function formatIngredientLabel(item) {
  const normalized = normalizeShoppingIngredient(item);
  const displayUnit = normalized.name === "ei" ? "" : formatIngredientUnit(normalized.unit, normalized.amount);
  const amount = normalized.amount == null ? "" : formatIngredientAmount(normalized.amount) + (displayUnit ? " " + displayUnit : "");
  const range = parseAmountRange(normalized.amount);
  const displayName = normalized.name === "ei" && (!range || range.min !== 1 || range.max !== 1) ? "eieren" : normalized.name;
  return amount + (amount ? " " : "") + displayName;
}

function ingredientLabel(item) {
  const labels = [item, ...(item.alternatives || [])].map(formatIngredientLabel);
  return labels.join(" of ");
}

function renderShoppingList() {
  shoppingListItems.replaceChildren();
  let currentCategory = "";
  let list;
  const items = sortedShoppingItems();
  const uncategorized = [];
  items.forEach((item) => {
    const category = shoppingCategory(item);
    if (category === "Overig" && !APPROVED_OTHER_NAMES.has(item.name)) uncategorized.push(item.name);
    if (category !== currentCategory) {
      const heading = document.createElement("h3");
      heading.textContent = category;
      shoppingListItems.append(heading);
      list = document.createElement("ul");
      list.className = "shopping-list";
      shoppingListItems.append(list);
      currentCategory = category;
    }
    const row = document.createElement("li");
    const label = document.createElement("label");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    label.append(checkbox, document.createTextNode(ingredientLabel(item)));
    row.append(label);
    list.append(row);
  });
  if (state.shoppingWarnings.length || uncategorized.length) {
    const heading = document.createElement("h3");
    heading.textContent = "Controleer deze boodschappen";
    shoppingListItems.append(heading);
    const warnings = document.createElement("ul");
    warnings.className = "shopping-list shopping-warnings";
    [...state.shoppingWarnings, ...uncategorized.map((name) => "Controleer de categorie van " + name + ".")].forEach((warning) => {
      const row = document.createElement("li");
      row.textContent = warning;
      warnings.append(row);
    });
    shoppingListItems.append(warnings);
  }
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
  return sections.join(" ").trim();
}

function wrapSvgText(value, maxLength, maxLines) {
  const words = String(value || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";
  words.forEach((word) => {
    const candidate = current ? current + " " + word : word;
    if (current && candidate.length > maxLength) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  });
  if (current) lines.push(current);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = lines[maxLines - 1].slice(0, maxLength - 1).trimEnd() + "…";
  }
  return lines;
}

function escapeXml(value) {
  return String(value || "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&apos;"
  }[character]));
}

function infographicSvg(recipe) {
  const title = escapeXml(recipe.title || "Recept");
  const category = escapeXml(String(recipe.category || "recept").toUpperCase());
  const ingredients = recipeIngredients(recipe).slice(0, 8).map(formatIngredientLabel);
  const steps = methodSteps(recipeMethod(recipe) || "Volg de bereidingswijze uit het recept.").slice(0, 5);
  const ingredientMarkup = ingredients.map((ingredient, index) => {
    const lines = wrapSvgText(ingredient, 38, 2);
    const y = 480 + index * 38;
    return `<circle cx="118" cy="${y}" r="5"/><text x="128" y="${y + 8}">${lines.map((line, lineIndex) => `<tspan x="128" dy="${lineIndex ? 21 : 0}">${escapeXml(line)}</tspan>`).join("")}</text>`;
  }).join("");
  const stepMarkup = steps.map((step, index) => {
    const y = 493 + index * 92;
    return `<circle cx="735" cy="${y}" r="34" fill="#e9795d"/><text x="735" y="${y + 12}" text-anchor="middle" fill="#fff" font-size="28" font-weight="800">${index + 1}</text><text x="795" y="${y - 7}" fill="#174c45" font-size="23" font-weight="700">Stap ${index + 1}</text><text x="795" y="${y + 27}" fill="#365f57" font-size="19">${escapeXml(step.slice(0, 92))}</text>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900" role="img" aria-labelledby="title desc">
  <title id="title">${title}</title>
  <desc id="desc">Infographic met ingrediënten en bereidingsstappen voor ${title}.</desc>
  <rect width="1600" height="900" rx="36" fill="#fff9f0"/>
  <circle cx="1470" cy="90" r="180" fill="#e9f0dc"/><circle cx="80" cy="830" r="210" fill="#f7ded4"/>
  <g fill="none" stroke="#174c45" stroke-width="7" stroke-linecap="round" opacity=".8"><path d="M1390 170c55-42 111-43 148-14-36 3-72 23-98 55"/><path d="M1420 208c-4-38 9-70 37-91"/></g>
  <text x="92" y="105" fill="#e9795d" font-family="Arial,sans-serif" font-size="24" font-weight="700" letter-spacing="3">${category} · ${recipe.portions || 2} PERSONEN</text>
  <text x="88" y="182" fill="#174c45" font-family="Arial,sans-serif" font-size="48" font-weight="800">${title.slice(0, 42)}</text>
  <rect x="90" y="280" width="185" height="52" rx="26" fill="#174c45"/><text x="182" y="315" text-anchor="middle" fill="#fff9f0" font-family="Arial,sans-serif" font-size="23" font-weight="700">RECEPT</text>
  <rect x="88" y="382" width="535" height="410" rx="28" fill="#fff" stroke="#d6e3d4" stroke-width="3"/>
  <text x="125" y="437" fill="#174c45" font-family="Arial,sans-serif" font-size="30" font-weight="800">INGREDIËNTEN</text>
  <g fill="#365f57" font-family="Arial,sans-serif" font-size="22">${ingredientMarkup}</g>
  <text x="700" y="405" fill="#174c45" font-family="Arial,sans-serif" font-size="30" font-weight="800">ZO MAAK JE HET</text>
  <g font-family="Arial,sans-serif">${stepMarkup}</g>
  <g transform="translate(1280 210) scale(.65)"><ellipse cx="100" cy="120" rx="250" ry="55" fill="#d6e3d4"/><path d="M-70 42c45-102 185-125 282-55 46 33 64 76 49 113-35 83-244 78-331 18-22-15-17-45 0-76z" fill="#d8a261" stroke="#174c45" stroke-width="7"/><circle cx="22" cy="62" r="20" fill="#d9584d" stroke="#174c45" stroke-width="6"/><circle cx="165" cy="67" r="18" fill="#83aa65" stroke="#174c45" stroke-width="6"/></g>
  </svg>`;
}

function svgDataUrl(svg) {
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}

function svgToPngDataUrl(svg) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 1600;
      canvas.height = 900;
      canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/png"));
    };
    image.onerror = reject;
    image.src = svgDataUrl(svg);
  });
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
    doc.text(day, x + dayWidth / 2, gridTop + 6, { align: "center" });
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
      links.push({ recipeId: item.recipeId, x, y, width: dayWidth, height: rowHeight });
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
  const doc = new window.jspdf.jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const margin = 16;
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const includeInfographics = document.querySelector("#include-infographics").checked;
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
    if (y > height - 25) { doc.addPage(); y = 20; currentCategory = ""; }
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
      if (includeInfographics) {
        const infographic = await svgToPngDataUrl(infographicSvg(recipe));
        doc.addPage();
        const infographicHeight = Math.min(height, width * 0.5625);
        doc.addImage(infographic, "PNG", 0, (height - infographicHeight) / 2, width, infographicHeight);
      }
      doc.addPage();
      if (!recipePages.has(recipe.id)) recipePages.set(recipe.id, doc.getNumberOfPages());
      doc.setTextColor(24, 63, 50);
      doc.setFont("times", "bold");
      doc.setCharSpace(0);
      doc.setFontSize(14);
      const title = String(recipe.title || "Recept").normalize("NFC").replace(/\s+/g, " ").trim();
      const recipeHeading = dayName(dayIndex) + " · " + meal + " · " + recipe.portions + " personen - " + title;
      y = addWrapped(doc, recipeHeading, margin, 24, width - margin * 2, 7) + 5;
      doc.setFontSize(12); doc.setTextColor(24, 63, 50); doc.text("Hoofdrecept · Ingrediënten", margin, y); y += 7;
      doc.setFontSize(10); doc.setTextColor(40, 45, 40);
      (recipe.ingredients || []).forEach((ingredient) => {
        y = addWrapped(doc, "• " + ingredientLabel(ingredient), margin, y, width - margin * 2);
      });
      (recipe.components || []).forEach((component) => {
        y += 4;
        doc.setFontSize(12); doc.setTextColor(24, 63, 50); doc.text("Subrecept · " + component.title, margin, y); y += 7;
        doc.setFontSize(10); doc.setTextColor(40, 45, 40);
        if (component.availabilityNote) y = addWrapped(doc, component.availabilityNote, margin, y, width - margin * 2);
        (component.ingredients || []).forEach((ingredient) => {
          y = addWrapped(doc, "• " + ingredientLabel(ingredient), margin, y, width - margin * 2);
        });
      });
      const equipment = recipeEquipment(recipe);
      if (equipment.length) {
        y += 4;
        doc.setFontSize(12); doc.setTextColor(24, 63, 50); doc.text("Benodigdheden", margin, y); y += 7;
        doc.setFontSize(10); doc.setTextColor(40, 45, 40);
        equipment.forEach((item) => { y = addWrapped(doc, "• " + item, margin, y, width - margin * 2); });
      }
      y += 6; doc.setFontSize(12); doc.setTextColor(24, 63, 50); doc.text("Bereidingswijze", margin, y); y += 7;
      doc.setFontSize(10); doc.setTextColor(40, 45, 40);
      let stepNumber = 1;
      (recipe.components || []).forEach((component) => {
        doc.setFontSize(12); doc.setTextColor(24, 63, 50); doc.text("Subrecept · " + component.title, margin, y); y += 7;
        doc.setFontSize(10); doc.setTextColor(40, 45, 40);
        const componentSteps = methodSteps(component.method || "");
        componentSteps.forEach((step) => {
          y = addWrapped(doc, `${stepNumber}. ${step}`, margin, y, width - margin * 2, 5);
          stepNumber += 1;
          if (y > height - margin) { doc.addPage(); y = 20; }
        });
        y += 4;
      });
      doc.setFontSize(12); doc.setTextColor(24, 63, 50); doc.text("Hoofdrecept", margin, y); y += 7;
      doc.setFontSize(10); doc.setTextColor(40, 45, 40);
      const mainSteps = methodSteps(recipe.method || "Zie het oorspronkelijke receptbestand.");
      mainSteps.forEach((step) => {
        y = addWrapped(doc, `${stepNumber}. ${step}`, margin, y, width - margin * 2, 5);
        stepNumber += 1;
        if (y > height - margin) { doc.addPage(); y = 20; }
      });
      if (recipe.notes?.length) {
        y += 5;
        doc.setFontSize(12);
        doc.setTextColor(24, 63, 50);
        doc.text("Opmerking", margin, y);
        y += 7;
        doc.setFontSize(10);
        doc.setTextColor(40, 45, 40);
        recipe.notes.forEach((note) => { y = addWrapped(doc, "• " + note, margin, y, width - margin * 2, 5); });
      }
    }
  }
  overviewLinks.forEach((link) => {
    const pageNumber = recipePages.get(link.recipeId);
    if (!pageNumber) return;
    doc.setPage(1);
    doc.link(link.x, link.y, link.width, link.height, { pageNumber });
  });
  doc.save("weekplanning.pdf");
}

document.querySelector("#clear-plan").addEventListener("click", () => {
  state.plan = {};
  savePlan();
  render();
});
search.addEventListener("input", renderOptions);
shoppingListButton.addEventListener("click", () => {
  renderShoppingList();
  shoppingListView.hidden = false;
  shoppingListView.scrollIntoView({ behavior: "smooth", block: "start" });
});
downloadButton.addEventListener("click", createPdf);

fetch("recipes.json")
  .then((response) => response.ok ? response.json() : Promise.reject(new Error("recipes")))
  .then((recipes) => {
    state.recipes = shuffleRecipes(attachSharedRecipeComponents(recipes).map(addPreparationTime));
    render();
  })
  .catch(() => {
    status.textContent = "De recepten konden niet worden geladen.";
    render();
  });
