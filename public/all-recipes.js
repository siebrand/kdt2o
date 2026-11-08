const status = document.querySelector("#status");
const download = document.querySelector("#download");

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

function estimatePreparationTime(recipe) {
  const method = [recipe.method || "", ...(recipe.components || []).map((component) => component.method || "")].join(" ");
  const durations = [...method.matchAll(/(\d+)(?:\s*-\s*(\d+))?\s*(?:minuten|min\.?)/gi)]
    .map((match) => Number(match[2] || match[1]))
    .filter((value) => Number.isFinite(value));
  if (durations.length) return Math.max(10, Math.min(180, Math.ceil(durations.reduce((total, value) => total + value, 0) / 5) * 5));
  return method.length > 900 ? 45 : method.length > 450 ? 30 : method.length > 180 ? 20 : 15;
}

function textLines(doc, value, x, y, width, lineHeight) {
  const lines = doc.splitTextToSize(String(value || ""), width);
  doc.text(lines, x, y);
  return y + lines.length * lineHeight;
}

function isSingularMeasure(value) {
  const fraction = String(value).replace(",", ".").match(/^(\d+)\/(\d+)$/);
  if (fraction) return Number(fraction[1]) <= Number(fraction[2]);
  const number = Number(String(value).replace(",", "."));
  return Number.isFinite(number) && number <= 1;
}

function ingredientText(ingredient) {
  const formatTablespoons = (value) => String(value || "")
    .replace(/(\d+(?:[.,]\d+)?)\s+of\s+meer\s+(?:el|eetlepel|eetlepels)\b/gi, "$1 of meer eetlepels")
    .replace(/(\d+(?:[.,]\d+)?)\s+of\s+meer\s+(?:tl|theelepel|theelepels)\b/gi, "$1 of meer theelepels")
    .replace(/(\d+(?:[.,]\d+)?|\d+\/\d+)\s+(?:el|eetlepel|eetlepels)\b/gi, (_, amount) => `${amount} ${isSingularMeasure(amount) ? "eetlepel" : "eetlepels"}`)
    .replace(/(\d+(?:[.,]\d+)?|\d+\/\d+)\s+(?:tl|theelepel|theelepels)\b/gi, (_, amount) => `${amount} ${isSingularMeasure(amount) ? "theelepel" : "theelepels"}`);
  const prefix = (item) => item.optional ? "optioneel: " : "";
  const main = prefix(ingredient) + formatTablespoons(ingredient.raw || ingredient.name || "");
  const alternatives = (ingredient.alternatives || []).map((item) => prefix(item) + formatTablespoons(item.raw || item.name || ""));
  return alternatives.length ? main + " of " + alternatives.join(" of ") : main;
}

function recipeEquipment(recipe) {
  return [
    ...(recipe.equipment || []),
    ...(recipe.components || []).flatMap((component) => component.equipment || [])
  ];
}

function recipeIngredients(recipe) {
  return [
    ...(recipe.ingredients || []),
    ...(recipe.dailyVariants || []).flatMap((variant) => variant.ingredients || [])
  ].sort((a, b) => Number(Boolean(a.optional)) - Number(Boolean(b.optional)));
}

async function buildPdf(recipes) {
  const doc = new window.jspdf.jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const columnGap = 10;
  const columnWidth = (pageWidth - margin * 2 - columnGap) / 2;

  recipes.forEach((recipe, recipeIndex) => {
    if (recipeIndex) doc.addPage();
    doc.setTextColor(24, 63, 50);
    doc.setFont("times", "bold");
    doc.setCharSpace(0);
    doc.setFontSize(17);
    const title = String(recipe.title || "Recept").normalize("NFC").replace(/\s+/g, " ").trim();
    doc.text(title, margin, 18, { charSpace: 0 });
    doc.setFontSize(9);
    doc.setTextColor(70, 80, 70);
    doc.text(
      (recipe.category || "recept") + " · " + (recipe.portions || "?") + " personen · " + (recipeIndex + 1) + " van " + recipes.length,
      margin,
      25
    );

    const rightX = margin + columnWidth + columnGap;
    doc.setFontSize(12);
    doc.setTextColor(24, 63, 50);
    doc.text("Hoofdrecept · Ingrediënten", margin, 36);
    doc.text("Hoofdrecept · Bereidingswijze", rightX, 36);

    doc.setFontSize(8.5);
    doc.setTextColor(40, 45, 40);
    let leftY = 43;
    recipeIngredients(recipe).forEach((ingredient) => {
      leftY = textLines(doc, "• " + ingredientText(ingredient), margin, leftY, columnWidth, 4.2);
    });
    (recipe.components || []).forEach((component) => {
      leftY += 2;
      doc.setFontSize(10);
      doc.setTextColor(24, 63, 50);
      doc.text("Subrecept: " + component.title, margin, leftY);
      leftY += 5;
      doc.setFontSize(8.5);
      doc.setTextColor(40, 45, 40);
      if (component.availabilityNote) {
        leftY = textLines(doc, component.availabilityNote, margin, leftY, columnWidth, 4.2);
      }
      (component.ingredients || []).forEach((ingredient) => {
        leftY = textLines(doc, "• " + ingredientText(ingredient), margin, leftY, columnWidth, 4.2);
      });
    });
    const equipment = recipeEquipment(recipe);
    if (equipment.length) {
      leftY += 2;
      doc.setFontSize(10);
      doc.setTextColor(24, 63, 50);
      doc.text("Benodigdheden", margin, leftY);
      leftY += 5;
      doc.setFontSize(8.5);
      doc.setTextColor(40, 45, 40);
      equipment.forEach((item) => {
        leftY = textLines(doc, "• " + item, margin, leftY, columnWidth, 4.2);
      });
    }

    let rightY = 43;
    (recipe.components || []).forEach((component) => {
      doc.setFontSize(10);
      doc.setTextColor(24, 63, 50);
      rightY = textLines(doc, "Subrecept: " + component.title, rightX, rightY, columnWidth, 4.2);
      doc.setFontSize(8.5);
      doc.setTextColor(40, 45, 40);
      if (component.availabilityNote) {
        rightY = textLines(doc, component.availabilityNote, rightX, rightY, columnWidth, 4.2);
      }
      const componentSteps = window.recipeMethodSteps(component.method || "");
      componentSteps.forEach((step, index) => {
        rightY = textLines(doc, /^Tip:/i.test(step) ? step : (index + 1) + ". " + step, rightX, rightY, columnWidth, 4.2);
        rightY += 1.2;
      });
      rightY += 1.5;
      doc.setFontSize(10);
      doc.setTextColor(24, 63, 50);
      rightY = textLines(doc, "Hoofdrecept", rightX, rightY, columnWidth, 4.2);
      doc.setFontSize(8.5);
      doc.setTextColor(40, 45, 40);
    });
    const mainSteps = window.recipeMethodSteps(recipe.method || "Zie het oorspronkelijke receptbestand.");
    mainSteps.forEach((step, index) => {
      rightY = textLines(doc, /^Tip:/i.test(step) ? step : (index + 1) + ". " + step, rightX, rightY, columnWidth, 4.2);
      rightY += 1.2;
    });
    (recipe.dailyVariants || []).forEach((variant) => {
      rightY += 1.5;
      doc.setFontSize(10);
      doc.setTextColor(24, 63, 50);
      rightY = textLines(doc, "Variant: " + variant.title, rightX, rightY, columnWidth, 4.2);
      doc.setFontSize(8.5);
      doc.setTextColor(40, 45, 40);
      window.recipeMethodSteps(variant.method || "").forEach((step, index) => {
        rightY = textLines(doc, /^Tip:/i.test(step) ? step : (index + 1) + ". " + step, rightX, rightY, columnWidth, 4.2);
        rightY += 1.2;
      });
    });

    if (recipe.notes?.length) {
      rightY += 2;
      doc.setFontSize(10);
      doc.setTextColor(24, 63, 50);
      doc.text("Opmerking", rightX, rightY);
      rightY += 5;
      doc.setFontSize(8.5);
      doc.setTextColor(40, 45, 40);
      recipe.notes.forEach((note) => {
        rightY = textLines(doc, "• " + note, rightX, rightY, columnWidth, 4.2);
      });
    }

    doc.setFontSize(7);
    doc.setTextColor(110, 110, 110);
    doc.text("Controle-export · " + (recipe.id || ""), margin, pageHeight - 7);
  });
  return doc;
}

async function prepare() {
  if (!window.jspdf?.jsPDF || !window.recipeMethodSteps) {
    status.textContent = "De PDF-module of stappenparser kon niet worden geladen.";
    return;
  }
  const response = await fetch("recipes.json");
  const recipes = attachSharedRecipeComponents(await response.json()).filter((recipe) => !recipe.approved).map((recipe) => ({
    ...recipe,
    preparationTime: Number.isFinite(recipe.preparationTime) ? recipe.preparationTime : estimatePreparationTime(recipe),
    preparationTimeEstimated: true
  }));
  const doc = await buildPdf(recipes);
  status.textContent = recipes.length + " recepten zijn verwerkt. Eén recept per pagina.";
  download.hidden = false;
  download.addEventListener("click", () => doc.save("alle-recepten-ter-controle.pdf"));
  doc.save("alle-recepten-ter-controle.pdf");
}

prepare().catch((error) => {
  console.error(error);
  status.textContent = "De PDF kon niet worden gemaakt. Controleer de browserconsole.";
});
