window.recipeMethodSteps = function recipeMethodSteps(method) {
  const text = String(method || "").replace(/\s+/g, " ").trim();
  const tipIndex = text.search(/\bTip:\s*/i);
  const mainText = tipIndex === -1 ? text : text.slice(0, tipIndex).trim();
  const tipTexts = tipIndex === -1
    ? []
    : text.slice(tipIndex).split(/(?=\bTip:\s*)/gi).map((tip) => tip.trim()).filter(Boolean);
  const protectedText = mainText.replace(/\b(?:[a-z]\.){2,}|(?:bijv|etc|ca)\./gi, (abbreviation) =>
    abbreviation.replace(/\./g, "\uE000")
  );
  const steps = protectedText.match(/[^.!?]+[.!?]+|[^.!?]+$/g)
    ?.map((step) => step.replace(/\uE000/g, ".").trim())
    .filter(Boolean) || [];
  return steps.concat(tipTexts);
};
