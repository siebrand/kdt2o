const DAYS = ["Maandag", "Dinsdag", "Woensdag", "Donderdag", "Vrijdag", "Zaterdag", "Zondag"];
const MEALS = ["ontbijt", "lunch", "diner"];
const PLAN_STORAGE_KEY = "kitano-weekplan";
const PLAN_STORAGE_VERSION = 2;
const state = { recipes: [], plan: loadPlan(), activeSlot: null, pendingRecipe: null };

const planner = document.querySelector("#planner");
const options = document.querySelector("#recipe-options");
const status = document.querySelector("#status");
const search = document.querySelector("#search");
const downloadButton = document.querySelector("#download-pdf");
const shoppingListButton = document.querySelector("#show-shopping-list");
const shoppingListView = document.querySelector("#shopping-list-view");
const shoppingListItems = document.querySelector("#shopping-list-items");

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

function planKey(day, meal) {
  return day + "-" + meal;
}

function recipeById(id) {
  return state.recipes.find((recipe) => recipe.id === id);
}

function selectedIds() {
  return new Set(Object.values(state.plan).filter(Boolean).map((item) => item.recipeId));
}

function isMultiDay(recipe) {
  return Boolean(recipe.multiDay);
}

function plannedDays(startDay) {
  return [startDay, startDay + 2, startDay + 4].filter((day) => day < DAYS.length);
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
  const query = search.value.trim().toLocaleLowerCase("nl");
  const selected = selectedIds();
  options.replaceChildren();
  const visible = state.recipes.filter((recipe) => {
    const matchesMeal = state.activeSlot && recipe.category === state.activeSlot.meal;
    const matchesSearch = !query || recipe.title.toLocaleLowerCase("nl").includes(query);
    return matchesMeal && !selected.has(recipe.id) && matchesSearch;
  });
  if (!state.activeSlot) {
    options.append(Object.assign(document.createElement("p"), { className: "muted", textContent: "Klik eerst op een leeg moment in de planning." }));
    return;
  }
  if (!visible.length) {
    options.append(Object.assign(document.createElement("p"), { className: "muted", textContent: "Geen recepten gevonden." }));
    return;
  }
  visible.forEach((recipe) => {
    const card = document.createElement("article");
    card.className = "recipe-card";
    const title = document.createElement("h3");
    title.textContent = recipe.title;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "button";
    button.textContent = "+";
    button.setAttribute("aria-label", "Toevoegen");
    button.title = "Toevoegen";
    button.addEventListener("click", () => chooseRecipe(recipe));
    card.append(title, button);
    options.append(card);
  });
}

function showSelectionMessage(message) {
  status.textContent = message;
  const notice = document.createElement("p");
  notice.className = "muted";
  notice.setAttribute("role", "alert");
  notice.textContent = message;
  options.replaceChildren(notice);
}

function chooseRecipe(recipe) {
  if (!state.activeSlot || selectedIds().has(recipe.id)) return;
  if (!isMultiDay(recipe)) {
    state.plan[planKey(state.activeSlot.day, state.activeSlot.meal)] = { recipeId: recipe.id, sourceDay: state.activeSlot.day };
    finishSelection();
    return;
  }
  const startDay = state.activeSlot.day;
  const days = plannedDays(startDay);
  if (days.length !== 3) {
    const validStartDays = DAYS.slice(0, DAYS.length - 4).join(", ");
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
}

function render() {
  renderPlanner();
  renderOptions();
  const count = Object.keys(state.plan).length;
  status.textContent = count ? count + " maaltijdmomenten gepland." : "Kies een leeg moment om te beginnen.";
  shoppingListButton.disabled = !count;
  downloadButton.disabled = !count;
}

function aggregateIngredients() {
  const totals = new Map();
  Object.values(state.plan).forEach((item) => {
    const recipe = recipeById(item.recipeId);
    (recipe?.ingredients || []).forEach((ingredient) => {
      const key = ingredient.key || ingredient.name.toLowerCase();
      const existing = totals.get(key);
      if (!existing || !ingredient.amount || existing.unit !== ingredient.unit) {
        totals.set(key + "-" + Math.random(), { ...ingredient });
        return;
      }
      if (typeof ingredient.amount === "number" && typeof existing.amount === "number") existing.amount += ingredient.amount;
    });
  });
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

function shoppingCategory(item) {
  const name = String(item.name || "").toLocaleLowerCase("nl");
  const has = (...terms) => terms.some((term) => name.includes(term));

  if (has("diepvries", "bevroren")) return "Diepvries";
  if (has("wortel", "ui", "courgette", "paprika", "tomaat", "komkommer", "biet", "avocado", "broccoli", "bloemkool", "spinazie", "sla", "champignon", "knoflook", "gember", "citroen", "limoen", "appel", "banaan", "aardbei", "framboos", "bosbes", "mango", "peer", "druif", "fruit")) return "Groente en fruit";
  if (has("yoghurt", "kwark", "melk", "kaas", "feta", "hüttenkäse", "huttenkase", "boter", "room", "ei", "eieren")) return "Zuivel en eieren";
  if (has("kip", "rund", "gehakt", "spek", "ham", "zalm", "tonijn", "vis", "tofu", "tempeh")) return "Vlees, vis en vleesvervangers";
  if (has("brood", "cracker", "havermout", "muesli", "granola")) return "Brood en ontbijt";
  if (has("zout", "peper", "kaneel", "kruiden", "oregano", "basilicum", "komijn", "kerrie", "paprikapoeder")) return "Kruiden en smaakmakers";
  if (has("pasta", "rijst", "quinoa", "couscous", "linzen", "bonen", "noten", "zaad", "olie", "azijn", "meel", "bloem", "cacao", "chocolade", "pindakaas", "honing", "bouillon")) return "Houdbare producten";
  return "Overig";
}

function sortedShoppingItems() {
  return aggregateIngredients().sort((a, b) => {
    const categoryDifference = SHOPPING_CATEGORIES.indexOf(shoppingCategory(a)) - SHOPPING_CATEGORIES.indexOf(shoppingCategory(b));
    return categoryDifference || a.name.localeCompare(b.name, "nl");
  });
}

function ingredientLabel(item) {
  const amount = item.amount == null ? "" : item.amount + (item.unit ? " " + item.unit : "");
  return amount + (amount ? " " : "") + item.name;
}

function renderShoppingList() {
  shoppingListItems.replaceChildren();
  let currentCategory = "";
  let list;
  sortedShoppingItems().forEach((item) => {
    const category = shoppingCategory(item);
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
  const text = String(method || "").replace(/\s+/g, " ").trim();
  return text.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((step) => step.trim()).filter(Boolean) || [];
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
        doc.text("Meerdaags", x + 2, y + rowHeight - 4);
        doc.setFontSize(9);
      }
    });
  });
  return links;
}

function createPdf() {
  if (!window.jspdf?.jsPDF) {
    status.textContent = "De PDF-module kon niet worden geladen. Controleer je internetverbinding.";
    return;
  }
  const doc = new window.jspdf.jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
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
    const amount = item.amount == null ? "" : item.amount + (item.unit ? " " + item.unit : "");
    y = addChecklistItem(doc, amount + (amount ? " " : "") + item.name, margin, y, width - margin * 2);
  });
  DAYS.forEach((day, dayIndex) => {
    MEALS.forEach((meal) => {
      const item = state.plan[planKey(dayIndex, meal)];
      if (!item) return;
      const recipe = recipeById(item.recipeId);
      doc.addPage();
      if (!recipePages.has(recipe.id)) recipePages.set(recipe.id, doc.getNumberOfPages());
      doc.setTextColor(24, 63, 50);
      doc.setFontSize(18);
      doc.text(recipe.title, margin, 24);
      doc.setFontSize(10);
      doc.setTextColor(70, 80, 70);
      doc.text(day + " · " + meal + " · " + recipe.portions + " personen", margin, 33);
      y = 46;
      y = addWrapped(doc, "Gepland voor: " + day, margin, y, width - margin * 2);
      y += 5;
      doc.setFontSize(12); doc.setTextColor(24, 63, 50); doc.text("Ingrediënten", margin, y); y += 7;
      doc.setFontSize(10); doc.setTextColor(40, 45, 40);
      (recipe.ingredients || []).forEach((ingredient) => {
        y = addWrapped(doc, "• " + ingredientLabel(ingredient), margin, y, width - margin * 2);
      });
      y += 6; doc.setFontSize(12); doc.setTextColor(24, 63, 50); doc.text("Bereidingswijze", margin, y); y += 7;
      doc.setFontSize(10); doc.setTextColor(40, 45, 40);
      const steps = methodSteps(recipe.method || "Zie het oorspronkelijke receptbestand.");
      steps.forEach((step, index) => {
        y = addWrapped(doc, `${index + 1}. ${step}`, margin, y, width - margin * 2, 5);
        if (y > height - margin && index < steps.length - 1) { doc.addPage(); y = 20; }
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
    });
  });
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

fetch("/recipes.json")
  .then((response) => response.ok ? response.json() : Promise.reject(new Error("recipes")))
  .then((recipes) => {
    state.recipes = recipes;
    render();
  })
  .catch(() => {
    status.textContent = "De recepten konden niet worden geladen.";
    render();
  });
