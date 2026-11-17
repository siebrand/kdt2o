FROM nginx:1.31-alpine
# Apply Alpine security updates that the upstream image does not contain yet.
RUN apk upgrade --no-cache
COPY nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY public ./usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
