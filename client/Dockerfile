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
#
# NOTE: Vite inlines VITE_* at BUILD time, so these cannot be changed on a
# published image — that is exactly why the API is same-origin and the nginx
# upstream is templated instead (see nginx/default.conf.template). Anything that
# must vary per deployment belongs in SPIREX_* nginx vars, NOT here.
ARG VITE_API_URL=

# AGPL-3.0 §13: the running app links to the source of the version being served.
# The official image points at upstream, which is correct because the official
# image is unmodified. IF YOU FORK AND PUBLISH YOUR OWN IMAGE, rebuild with
# --build-arg VITE_SOURCE_URL=https://github.com/you/your-fork to stay compliant.
ARG VITE_SOURCE_URL=https://github.com/Rit-Services/Spirex

ENV VITE_API_URL=$VITE_API_URL
ENV VITE_SOURCE_URL=$VITE_SOURCE_URL

WORKDIR /app/client

RUN npm run build

FROM nginx:stable-alpine AS runtime

# Static fallbacks. The publish workflow overrides version/revision/created via
# docker/metadata-action. `image.source` is what makes GHCR link the package to
# the repo — both a nicety and the AGPL source-availability pointer on the
# artifact itself.
LABEL org.opencontainers.image.title="SPIREX client" \
      org.opencontainers.image.description="SPIREX frontend — nginx serving the React SPA and proxying /api to the SPIREX server" \
      org.opencontainers.image.source="https://github.com/Rit-Services/Spirex" \
      org.opencontainers.image.url="https://github.com/Rit-Services/Spirex" \
      org.opencontainers.image.documentation="https://github.com/Rit-Services/Spirex/blob/main/docs/self-hosting.md" \
      org.opencontainers.image.vendor="RIT Services" \
      org.opencontainers.image.licenses="AGPL-3.0-only"

# Runtime knobs consumed by nginx/default.conf.template. The defaults are the
# bundled compose file's topology, so `docker compose up -d` needs none of them.
ENV SPIREX_API_UPSTREAM=server:4000 \
    SPIREX_DNS_RESOLVER=127.0.0.11 \
    SPIREX_MAX_BODY_SIZE=320m
# Restrict envsubst to our own vars — see the header of default.conf.template for
# why an unfiltered substitution silently destroys the proxy.
ENV NGINX_ENVSUBST_FILTER=^SPIREX_

COPY --from=builder /app/client/dist /usr/share/nginx/html
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1/index.html >/dev/null 2>&1 || exit 1

CMD ["nginx", "-g", "daemon off;"]
