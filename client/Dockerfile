FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY client/package.json ./client/

RUN npm ci --workspace=client --include-workspace-root

COPY client ./client
# The /api-docs page imports the external-API markdown from the repo's docs/
# folder via the Vite `@docs` alias (../docs). docs/ lives outside client/, so
# it must be copied into the build context or `npm run build` can't resolve it.
COPY docs ./docs

# The frontend is served SAME-ORIGIN with the API — nginx proxies /api to the
# server — and the client's URL map already includes the /api prefix. So this
# MUST stay EMPTY (API_BASE=''); setting it to '/api' double-prefixes every
# request into /api/api/... . Only set it to a full origin (https://api.example.com)
# if you deliberately serve the API on a SEPARATE origin.
ARG VITE_API_URL=
ENV VITE_API_URL=$VITE_API_URL

WORKDIR /app/client

RUN npm run build

FROM nginx:stable-alpine AS runtime

COPY --from=builder /app/client/dist /usr/share/nginx/html
COPY nginx/default.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
