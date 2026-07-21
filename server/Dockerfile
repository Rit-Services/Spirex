FROM node:20-bookworm-slim AS builder

WORKDIR /app

# Install OpenSSL for Prisma compatibility
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY server/package.json ./server/

RUN npm ci --workspace=server --include-workspace-root

COPY server ./server

# Generates the Prisma client into /app/node_modules/.prisma. Done ONCE, here,
# as root — the runtime stage never regenerates it (see CMD).
RUN npm --workspace=server run prestart

FROM node:20-bookworm-slim AS production

LABEL org.opencontainers.image.title="SPIREX server" \
      org.opencontainers.image.description="SPIREX API — Express + Prisma + PostgreSQL" \
      org.opencontainers.image.source="https://github.com/Rit-Services/Spirex" \
      org.opencontainers.image.url="https://github.com/Rit-Services/Spirex" \
      org.opencontainers.image.documentation="https://github.com/Rit-Services/Spirex/blob/main/docs/self-hosting.md" \
      org.opencontainers.image.vendor="RIT Services" \
      org.opencontainers.image.licenses="AGPL-3.0-only"

WORKDIR /app

# Install OpenSSL and curl for Prisma runtime compatibility and health checks
RUN apt-get update -y && apt-get install -y openssl curl && rm -rf /var/lib/apt/lists/*

# Copied as ROOT and left root-owned on purpose: the app only ever READS its own
# code and dependencies, so a non-root process cannot tamper with them at runtime.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/server ./server

# The ONLY writable path. `node` (uid 1000) ships with the base image.
# Docker seeds a FRESH named volume from the image directory, ownership included,
# so a new install's server_uploads volume comes up node-owned. An install that
# already ran the old root-only image has a root-owned volume — see
# docs/self-hosting.md ("Upgrading from a pre-published-image install").
RUN mkdir -p /app/server/uploads && chown -R node:node /app/server/uploads

# npm workspaces hoist devDependency binaries (prisma, tsx) to the ROOT
# node_modules/.bin, which is why CMD can call them by bare name.
ENV PATH="/app/node_modules/.bin:${PATH}" \
    HOME=/home/node \
    NODE_ENV=production

USER node

WORKDIR /app/server

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD curl -fsS http://127.0.0.1:${PORT:-4000}/api/health >/dev/null || exit 1

# Deliberately NOT `npm start`. npm would fire the `prestart` hook, which runs
# `prisma generate` and tries to WRITE into root-owned /app/node_modules/.prisma
# — instant EACCES now that we run as `node`. The client is already generated in
# the builder stage, so calling tsx directly is both correct and faster to boot.
#
# `migrate deploy` on boot is intentional for single-instance self-hosting. It is
# NOT safe to scale this service past one replica without an external migration
# step: concurrent replicas would race on the same migration.
CMD ["sh", "-c", "prisma migrate deploy && exec tsx index.ts"]
