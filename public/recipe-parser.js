window.recipeMethodSteps = function recipeMethodSteps(method) {
  const text = String(method || "").replace(/\s+/g, " ").trim();
  const protectedText = text.replace(/\b(?:[a-z]\.){2,}|(?:bijv|etc|ca)\./gi, (abbreviation) =>
    abbreviation.replace(/\./g, "\uE000")
  );
  return protectedText.match(/[^.!?]+[.!?]+|[^.!?]+$/g)
    ?.map((step) => step.replace(/\uE000/g, ".").trim())
    .filter(Boolean) || [];
};
