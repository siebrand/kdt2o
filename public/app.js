const DAYS = ["Maandag", "Dinsdag", "Woensdag", "Donderdag", "Vrijdag", "Zaterdag", "Zondag"];
const MEALS = ["ontbijt", "lunch", "diner"];
const state = { recipes: [], plan: loadPlan(), activeSlot: null, pendingRecipe: null };

const planner = document.querySelector("#planner");
const options = document.querySelector("#recipe-options");
const status = document.querySelector("#status");
const search = document.querySelector("#search");
const downloadButton = document.querySelector("#download-pdf");

function loadPlan() {
  try {
    const saved = JSON.parse(localStorage.getItem("kitano-weekplan") || "{}");
    return saved && typeof saved === "object" ? saved : {};
  } catch {
    return {};
  }
}

function savePlan() {
  localStorage.setItem("kitano-weekplan", JSON.stringify(state.plan));
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
        slot.addEventListener("click", () => {
          delete state.plan[planKey(dayIndex, meal)];
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
    button.textContent = "Toevoegen";
    button.addEventListener("click", () => chooseRecipe(recipe));
    card.append(title, button);
    options.append(card);
  });
}

function chooseRecipe(recipe) {
  if (!state.activeSlot || selectedIds().has(recipe.id)) return;
  if (!isMultiDay(recipe)) {
    state.plan[planKey(state.activeSlot.day, state.activeSlot.meal)] = { recipeId: recipe.id, sourceDay: state.activeSlot.day };
    finishSelection();
    return;
  }
  if (state.activeSlot.day > 2) {
    status.textContent = "Dit recept past niet meer drie keer in de week vanaf deze dag.";
    return;
  }
  state.pendingRecipe = recipe;
  const select = document.querySelector("#start-day");
  select.replaceChildren(...DAYS.slice(0, 3).map((day, index) => new Option(day, index)));
  select.value = String(state.activeSlot.day);
  document.querySelector("#day-help").textContent = recipe.title + " wordt gepland op drie dagen met steeds een dag ertussen.";
  document.querySelector("#day-dialog").showModal();
}

document.querySelector("#day-form").addEventListener("submit", (event) => {
  event.preventDefault();
  if (event.submitter?.value !== "confirm") {
    document.querySelector("#day-dialog").close();
    return;
  }
  const startDay = Number(document.querySelector("#start-day").value);
  const days = plannedDays(startDay);
  if (days.length !== 3) {
    status.textContent = "Kies een startdag waarmee drie momenten binnen de week vallen.";
    return;
  }
  const meal = state.activeSlot.meal;
  if (days.some((day) => state.plan[planKey(day, meal)])) {
    status.textContent = "Een van de dagen is al gevuld. Kies eerst een andere plek.";
    document.querySelector("#day-dialog").close();
    return;
  }
  days.forEach((day) => { state.plan[planKey(day, meal)] = { recipeId: state.pendingRecipe.id, sourceDay: startDay }; });
  document.querySelector("#day-dialog").close();
  finishSelection();
});

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

function addWrapped(doc, text, x, y, maxWidth, lineHeight = 6) {
  const lines = doc.splitTextToSize(String(text || ""), maxWidth);
  doc.text(lines, x, y);
  return y + lines.length * lineHeight;
}

function createPdf() {
  if (!window.jspdf?.jsPDF) {
    status.textContent = "De PDF-module kon niet worden geladen. Controleer je internetverbinding.";
    return;
  }
  const doc = new window.jspdf.jsPDF();
  const margin = 16;
  const width = doc.internal.pageSize.getWidth();
  doc.setTextColor(24, 63, 50);
  doc.setFontSize(24);
  doc.text("Voeding Leeft", margin, 24);
  doc.setFontSize(18);
  doc.text("Mijn weekplanning", margin, 42);
  doc.setFontSize(10);
  doc.setTextColor(70, 80, 70);
  let y = 56;
  DAYS.forEach((day, index) => {
    const meals = MEALS.map((meal) => state.plan[planKey(index, meal)]).filter(Boolean);
    if (meals.length) {
      y = addWrapped(doc, day + ": " + meals.map((item) => recipeById(item.recipeId)?.title).join(", "), margin, y, width - margin * 2);
    }
  });
  doc.addPage();
  doc.setTextColor(24, 63, 50);
  doc.setFontSize(20);
  doc.text("Boodschappenlijst", margin, 24);
  doc.setFontSize(10);
  y = 36;
  aggregateIngredients().forEach((item) => {
    const amount = item.amount == null ? "" : item.amount + (item.unit ? " " + item.unit : "");
    y = addWrapped(doc, "☐ " + amount + (amount ? " " : "") + item.name, margin, y, width - margin * 2);
    if (y > 275) { doc.addPage(); y = 20; }
  });
  const ordered = Object.entries(state.plan).sort(([a], [b]) => a.localeCompare(b));
  ordered.forEach(([key, item]) => {
    const recipe = recipeById(item.recipeId);
    doc.addPage();
    doc.setTextColor(24, 63, 50);
    doc.setFontSize(18);
    doc.text(recipe.title, margin, 24);
    doc.setFontSize(10);
    doc.setTextColor(70, 80, 70);
    doc.text(recipe.category + " · " + recipe.portions + " personen", margin, 33);
    y = 46;
    y = addWrapped(doc, "Gepland voor: " + DAYS[Number(key.split("-")[0])] + " " + key.split("-")[1], margin, y, width - margin * 2);
    y += 5;
    doc.setFontSize(12); doc.setTextColor(24, 63, 50); doc.text("Ingrediënten", margin, y); y += 7;
    doc.setFontSize(10); doc.setTextColor(40, 45, 40);
    (recipe.ingredients || []).forEach((ingredient) => {
      const amount = ingredient.amount == null ? "" : ingredient.amount + (ingredient.unit ? " " + ingredient.unit : "");
      y = addWrapped(doc, "• " + amount + (amount ? " " : "") + ingredient.name, margin, y, width - margin * 2);
    });
    y += 6; doc.setFontSize(12); doc.setTextColor(24, 63, 50); doc.text("Bereidingswijze", margin, y); y += 7;
    doc.setFontSize(10); doc.setTextColor(40, 45, 40);
    addWrapped(doc, recipe.method || "Zie het oorspronkelijke receptbestand.", margin, y, width - margin * 2, 5);
  });
  doc.save("weekplanning.pdf");
}

document.querySelector("#clear-plan").addEventListener("click", () => {
  state.plan = {};
  savePlan();
  render();
});
search.addEventListener("input", renderOptions);
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
