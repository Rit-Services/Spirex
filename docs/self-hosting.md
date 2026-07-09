# Self-hosting SPIREX

Two supported ways to run SPIREX: **Docker Compose** (recommended) or **local dev**.

## Docker Compose (recommended)

Prereqs: Docker + Docker Compose.

```bash
cp .env.example .env
# Edit .env — at minimum set:
#   POSTGRES_PASSWORD, JWT_SECRET, ENCRYPTION_KEY   (openssl rand -hex 32)
docker compose up -d --build
```

This starts three services: **postgres**, **server** (Express API, port 4000 internal), and **frontend** (nginx serving the SPA + proxying `/api` to the server). Only the frontend is exposed — on port **80** by default (`FRONTEND_PORT` to change it). Open **http://localhost**.

Database migrations run automatically on server boot (`prisma migrate deploy`).

Useful commands:

```bash
docker compose logs -f server     # follow API logs
docker compose down               # stop
docker compose down -v            # stop + wipe data volumes
```

### Optional: MinIO object storage

By default uploads live on the `server_uploads` docker volume (`STORAGE_DRIVER=local`). To use S3-compatible object storage, set `STORAGE_DRIVER=minio` in `.env` and start with the profile:

```bash
docker compose --profile minio up -d --build
```

See [storage.md](storage.md) for creating the bucket and pointing at AWS S3 instead.

## Local dev

Prereqs: Node 20+, npm 10+, a running PostgreSQL.

```bash
npm install
cp server/env.example server/.env    # set DATABASE_URL + JWT_SECRET + ENCRYPTION_KEY
cp client/env.example client/.env
npm run migrate:deploy && npm run seed
npm run dev:server                   # terminal 1  → http://localhost:4000
npm run dev:client                   # terminal 2  → http://localhost:5173
```

The Vite dev server proxies `/api` to the backend, so the app is same-origin in dev.

## First run

- Set **`ADMIN_EMAIL`** and **`ADMIN_PASSWORD`** in your env. On the first boot with an empty database, SPIREX automatically creates that single admin account and its organization — no manual seeding. Log in with those credentials, then invite your team from the **Users** page.
- The env values are used **only** to create the account. Once any user exists the bootstrap does nothing, so change the admin password **in-app** afterward (not via env).
- In local dev, `npm run seed` runs the same bootstrap (reads `ADMIN_EMAIL`/`ADMIN_PASSWORD` from `server/.env`). No demo users or sample data are created.
- SPIREX is **invite-only** — SSO and email/password both authenticate *existing* accounts; they never self-register a new user.

## What needs secrets

| Required | `JWT_SECRET`, `ENCRYPTION_KEY`, Postgres password |
|---|---|
| Optional | AI ([ai-providers.md](ai-providers.md)), SMTP ([email-smtp.md](email-smtp.md)), Microsoft SSO ([sso-microsoft.md](sso-microsoft.md)), MinIO/S3 ([storage.md](storage.md)) |

Generate strong secrets with `openssl rand -hex 32`. Never commit your real `.env`.
