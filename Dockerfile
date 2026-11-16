FROM nginx:1.31-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY public ./usr/share/nginx/html
COPY CHANGELOG.md ./usr/share/nginx/html/CHANGELOG.md
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
