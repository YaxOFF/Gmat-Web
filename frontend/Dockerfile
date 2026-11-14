# syntax=docker/dockerfile:1
# Build de Vite servido por nginx sin privilegios, con proxy /api (HTTP y WebSocket) al backend.

FROM node:22-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# vite.config.ts copia los assets de Cesium a public/cesium y de ahí a dist/cesium.
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.29-alpine
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /src/dist /usr/share/nginx/html
# Host:puerto del backend dentro de la red de compose. Solo se sustituye esta variable.
ENV API_UPSTREAM=api:8000 \
    NGINX_ENVSUBST_FILTER=^API_UPSTREAM$
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1
