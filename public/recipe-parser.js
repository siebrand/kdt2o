window.recipeMethodSteps = function recipeMethodSteps(method) {
  const text = String(method || "").replace(/\s+/g, " ").trim();
  const tipIndex = text.search(/\bTip:\s*/i);
  const mainText = tipIndex === -1 ? text : text.slice(0, tipIndex).trim();
  const tipText = tipIndex === -1 ? "" : text.slice(tipIndex).trim();
  const protectedText = mainText.replace(/\b(?:[a-z]\.){2,}|(?:bijv|etc|ca)\./gi, (abbreviation) =>
    abbreviation.replace(/\./g, "\uE000")
  );
  const steps = protectedText.match(/[^.!?]+[.!?]+|[^.!?]+$/g)
    ?.map((step) => step.replace(/\uE000/g, ".").trim())
    .filter(Boolean) || [];
  if (tipText) steps.push(tipText);
  return steps;
};
