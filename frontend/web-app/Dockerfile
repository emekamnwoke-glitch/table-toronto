# Build the Vite bundle, then serve it with nginx. nginx also proxies /api to
# the api-gateway container, so the browser stays same-origin, as in the
# dev server's proxy.
FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
