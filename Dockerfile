FROM python:3.12-alpine AS data
RUN pip install --no-cache-dir pypdf==5.4.0
WORKDIR /build
COPY recipes ./recipes
COPY scripts ./scripts
COPY public ./public
RUN --mount=type=cache,id=kitano-recipe-cache,target=/build/cache RECIPE_CACHE_FILE=/build/cache/recipes.json python scripts/extract_recipes.py recipes public/recipes.json

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY public ./usr/share/nginx/html
COPY --from=data /build/public/recipes.json /usr/share/nginx/html/recipes.json
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
