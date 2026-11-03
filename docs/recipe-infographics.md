# Recipe infographic standard

## Purpose

Recipe infographics use one repeatable visual language for the recipe picker and the PDF. The first implementation is `recipe-infographic-v1`.

## Format and layout

- Canvas: 1600 × 900 px, landscape, 16:9.
- Background: warm cream (`#FFF9F0`), with deep green (`#174C45`) and coral (`#E9795D`) accents.
- Typography: system sans-serif only; bold title, short labels, generous line spacing.
- Composition: title and metadata at the top, ingredients in a compact left panel, three to seven numbered preparation steps on the right, and one simple food illustration in the lower-right area.
- Use rounded cards, thin green lines, flat colours, and restrained decorative leaf/seed shapes.
- No gradients, photorealism, brand logos, unverified nutrition claims, or text rendered by an image model.
- All visible text is generated from the structured recipe data and stays Dutch.

## Generation prompt

When an image model is used for decorative artwork, use this prompt and keep the style version unchanged:

```text
Create a clean, friendly Dutch meal-planner food illustration in the style recipe-infographic-v1.
Use a warm cream background, deep forest green linework, coral accents, muted avocado green,
flat editorial vector shapes, rounded forms, subtle hand-drawn texture, and generous whitespace.
Show only the prepared dish and its key ingredients: {dish_description}.
The composition must work inside the lower-right quarter of a 1600x900 landscape infographic.
Do not include any words, letters, numbers, labels, logos, packaging, people, or watermark.
Keep the shapes simple enough to remain legible as a small recipe-picker thumbnail.
```

Negative prompt:

```text
photorealistic, 3D render, gradient, clutter, dark background, tiny unreadable details,
text, letters, numbers, logo, watermark, packaging, hands, people, duplicated ingredients,
unrelated food, medical or nutrition claims
```

The generated artwork is placed behind a deterministic SVG/HTML template. Text is never delegated to the image model. Future assets must record the style version, prompt version, source recipe id, and generation date in the asset manifest.

## Quality checklist

1. The title, portions, ingredients, and steps match `public/recipes.json`.
2. The infographic is readable at thumbnail size and at full PDF width.
3. No text is clipped and no ingredient is invented.
4. Every recipe has one stable asset path and a Dutch alternative text.
5. A visual contact sheet is reviewed before generating the complete asset set.

