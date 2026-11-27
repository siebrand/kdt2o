// The weekly PDF and the single-recipe PDF, made in the browser with jsPDF.
import {MESSAGES} from "./messages.js";
import {DAYS, MEALS, dayName, planKey, plannedDays, shortDayName} from "./plan.js";
import {ingredientLabel, methodSteps, recipeEquipment, recipeMetadataLabel, recipeSourceUrl, recipeTimingLabel, sortIngredientsForDisplay} from "./recipes.js";
import {formatIngredientAmount, formatIngredientUnit, shoppingCategory} from "./shopping.js";
import {currentShoppingItems, plannedRecipes, recipeById, reportStatus, state} from "./state.js";

export function addWrapped(doc, text, x, y, maxWidth, lineHeight = 6) {
    const lines = doc.splitTextToSize(String(text || ""), maxWidth);
    doc.text(lines, x, y);
    return y + lines.length * lineHeight;
}

export function addChecklistItem(doc, text, x, y, maxWidth) {
    doc.rect(x, y - 2.5, 3, 3);
    return addWrapped(doc, text, x + 6, y, maxWidth - 6);
}

export function drawWeeklyOverview(doc, margin, width) {
    const links = [];
    const gridTop = 52;
    const labelWidth = 28;
    const dayWidth = (width - margin * 2 - labelWidth) / DAYS.length;
    const headerHeight = 10;
    const rowHeight = 34;
    doc.setTextColor(24, 63, 50);
    doc.setFontSize(24);
    doc.text(MESSAGES.brand, margin, 24);
    doc.setFontSize(18);
    doc.text(MESSAGES.weekPlanTitle, margin, 40);
    doc.setFontSize(9);
    doc.setDrawColor(190, 202, 188);
    doc.setFillColor(239, 243, 232);
    doc.rect(margin, gridTop, labelWidth, headerHeight, "FD");
    doc.text(MESSAGES.mealColumn, margin + 2, gridTop + 6);
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
            const lines = doc.splitTextToSize(recipe?.title || MESSAGES.unknownRecipe, dayWidth - 4);
            doc.setTextColor(24, 63, 50);
            doc.text(lines.slice(0, 3), x + 2, y + 7);
            links.push({recipeId: item.recipeId, x, y, width: dayWidth, height: rowHeight});
            if (recipe?.multiDay) {
                doc.setFontSize(7);
                doc.setTextColor(70, 80, 70);
                const scheduledDays = Number.isInteger(item.sourceDay) ? plannedDays(item.sourceDay, recipe.days).map((day) => shortDayName(day)).join(", ") : MESSAGES.multipleDays;
                doc.text(scheduledDays, x + 2, y + rowHeight - 4);
                doc.setFontSize(9);
            }
        });
    });
    return links;
}

export async function createPdf() {
    if (!window.jspdf?.jsPDF) {
        reportStatus(MESSAGES.pdfModuleMissing);
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
    doc.text(MESSAGES.shoppingList, margin, 24);
    doc.setFontSize(10);
    let y = 36;
    const leftOut = plannedRecipes().filter(({excluded}) => excluded).map(({recipe}) => recipe?.title || MESSAGES.unknownRecipe);
    if (leftOut.length) {
        doc.setTextColor(70, 80, 70);
        y = addWrapped(doc, MESSAGES.shoppingListLeftOut(leftOut), margin, y, width - margin * 2) + 4;
        doc.setTextColor(40, 45, 40);
    }
    const shoppingItems = currentShoppingItems();
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
            const title = String(recipe.title || MESSAGES.recipeFallbackTitle).normalize("NFC").replace(/\s+/g, " ").trim();
            const recipeHeading = dayName(dayIndex) + " · " + meal + " · " + MESSAGES.portions(recipe.portions) + " - " + title;
            y = addWrapped(doc, recipeHeading, margin, 24, width - margin * 2, 7) + 2;
            doc.setFont("helvetica", "normal");
            doc.setFontSize(9);
            doc.setTextColor(70, 80, 70);
            y = addWrapped(doc, recipeTimingLabel(recipe), margin, y, width - margin * 2, 4) + 3;
            const mainIngredients = sortIngredientsForDisplay(recipe.ingredients || []);
            if (mainIngredients.length) {
                doc.setFontSize(12);
                doc.setTextColor(24, 63, 50);
                doc.text(MESSAGES.mainIngredients, margin, y);
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
                doc.text(MESSAGES.subrecipe(component.title), margin, y);
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
                doc.text(MESSAGES.variant(variant.title), margin, y);
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
                doc.text(MESSAGES.equipment, margin, y);
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
            doc.text(MESSAGES.method, margin, y);
            y += 7;
            doc.setFontSize(10);
            doc.setTextColor(40, 45, 40);
            let stepNumber = 1;
            (recipe.components || []).forEach((component) => {
                doc.setFontSize(12);
                doc.setTextColor(24, 63, 50);
                doc.text(MESSAGES.subrecipe(component.title), margin, y);
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
                doc.text(MESSAGES.mainRecipe, margin, y);
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
                doc.text(MESSAGES.mainRecipe, margin, y);
                y += 7;
                doc.setFontSize(10);
                doc.setTextColor(40, 45, 40);
                const mainSteps = methodSteps(recipe.method || MESSAGES.methodMissing);
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
                doc.text(MESSAGES.variant(variant.title), margin, y);
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
                doc.text(MESSAGES.note, margin, y);
                y += 7;
                doc.setFontSize(10);
                doc.setTextColor(40, 45, 40);
                recipe.notes.forEach((note) => {
                    y = addWrapped(doc, "• " + note, margin, y, width - margin * 2, 5);
                });
            }
            y = addSourceLine(doc, recipe, margin, y + 5);
        }
    }
    overviewLinks.forEach((link) => {
        const pageNumber = recipePages.get(link.recipeId);
        if (!pageNumber) return;
        doc.setPage(1);
        doc.link(link.x, link.y, link.width, link.height, {pageNumber});
    });
    doc.save(MESSAGES.weekPlanFilename);
}

// Writes "Bron: <site>" as a link to the source of the recipe, when it has one. Returns the next y position.
function addSourceLine(doc, recipe, x, y) {
    const url = recipeSourceUrl(recipe);
    if (!url) return y;
    doc.setFontSize(9);
    doc.setTextColor(40, 45, 40);
    doc.textWithLink(MESSAGES.sourcePrefix + recipe.source.name, x, y, {url});
    return y + 5;
}

export async function createSingleRecipePdf(recipe) {
    if (!window.jspdf?.jsPDF) {
        reportStatus(MESSAGES.pdfModuleMissing);
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
    addSection(MESSAGES.ingredients, sortIngredientsForDisplay(recipe.ingredients || []).map(ingredientLabel));
    (recipe.components || []).forEach((component) => {
        const items = [];
        if (component.availabilityNote) items.push(component.availabilityNote);
        items.push(...sortIngredientsForDisplay(component.ingredients || []).map(ingredientLabel));
        addSection(MESSAGES.subrecipe(component.title), items);
    });
    (recipe.dailyVariants || []).forEach((variant) => addSection(MESSAGES.variant(variant.title), sortIngredientsForDisplay(variant.ingredients || []).map(ingredientLabel)));
    addSection(MESSAGES.equipment, recipeEquipment(recipe));
    if ((recipe.components || []).length || recipe.method || (recipe.dailyVariants || []).length) {
        addMethodHeading(MESSAGES.method);
        if (recipe.components?.length) {
            recipe.components.forEach((component) => {
                addMethodHeading(MESSAGES.subrecipe(component.title));
                addMethodSteps(component.method || "");
            });
            addMethodHeading(MESSAGES.mainRecipe);
            addMethodSteps(recipe.method || "");
        } else {
            addMethodHeading(MESSAGES.mainRecipe);
            addMethodSteps(recipe.method || MESSAGES.methodMissing);
        }
        (recipe.dailyVariants || []).forEach((variant) => {
            addMethodHeading(MESSAGES.variant(variant.title));
            addMethodSteps(variant.method || "");
        });
    }
    addSection(MESSAGES.note, recipe.notes || []);
    addSourceLine(doc, recipe, margin, y);
    doc.save((recipe.id || MESSAGES.recipe) + ".pdf");
}
