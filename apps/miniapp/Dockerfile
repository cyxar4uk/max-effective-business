# Мини-приложение «Тандем»: сборка Vite → статика за nginx (порт 80).
# Alpine в обоих этапах: healthcheck в compose ходит через wget (busybox), в debian-образе nginx его нет.

FROM node:24.21.0-alpine3.24 AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM nginx:1.30.5-alpine3.24-slim
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
