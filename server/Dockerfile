FROM node:20-bookworm-slim AS builder

WORKDIR /app

# Install OpenSSL for Prisma compatibility
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY server/package.json ./server/

RUN npm ci --workspace=server --include-workspace-root

COPY server ./server

RUN npm --workspace=server run prestart

FROM node:20-bookworm-slim AS production

WORKDIR /app

# Install OpenSSL and curl for Prisma runtime compatibility and health checks
RUN apt-get update -y && apt-get install -y openssl curl && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/server ./server

WORKDIR /app/server

EXPOSE 4000

CMD ["sh", "-c", "npx prisma migrate deploy && npm start"]
