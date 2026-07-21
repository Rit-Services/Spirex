# Self-hosting SPIREX

Two supported ways to run SPIREX: **Docker Compose** (recommended) or **local dev**.

## Docker Compose (recommended)

Prereqs: Docker + Docker Compose. Nothing else — `docker-compose.yml` pulls prebuilt images, so the host needs no Node toolchain and never compiles anything.

```bash
cp .env.example .env
# Edit .env — at minimum set:
#   POSTGRES_PASSWORD, JWT_SECRET, ENCRYPTION_KEY   (openssl rand -hex 32)
docker compose up -d
```

This starts three services: **postgres**, **server** (Express API, port 4000 internal), and **frontend** (nginx serving the SPA + proxying `/api` to the server). Only the frontend is exposed — on port **80** by default (`FRONTEND_PORT` to change it). Open **http://localhost**.

Database migrations run automatically on server boot (`prisma migrate deploy`).

Useful commands:

```bash
docker compose logs -f server     # follow API logs
docker compose pull && docker compose up -d   # upgrade to the newest images
docker compose down               # stop
docker compose down -v            # stop + wipe data volumes
```

### Pinning a version

`SPIREX_VERSION` in `.env` selects the image tag for both services. It defaults to `latest`, which moves on every release — **pin an exact version in production** so an upgrade is something you choose:

```bash
SPIREX_VERSION=0.2.0
```

Available tags: `0.2.0` (exact), `0.2` / `0` (tracks), `latest` (newest stable), `edge` (every commit on `main`, unstable). Images are published for `linux/amd64` and `linux/arm64`.

### Building from source instead

Contributors and fork operators layer the build override on top of the base file:

```bash
docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build
```

If you run a **modified** SPIREX as a network service, AGPL-3.0 §13 requires the in-app "Source code" link to point at *your* source. Set `VITE_SOURCE_URL=https://github.com/you/your-fork` in `.env` before building — it is inlined at build time and cannot be changed afterwards on a prebuilt image.

### Running outside the bundled compose file

The published client image hardcodes nothing about the topology. Two env vars retarget the `/api` proxy without a rebuild:

| Var | Default | When to change it |
|---|---|---|
| `SPIREX_API_UPSTREAM` | `server:4000` | Your API service is reachable under a different name/port (e.g. `spirex-server:4000` on Kubernetes) |
| `SPIREX_DNS_RESOLVER` | `127.0.0.11` | You are **not** on a Docker bridge network. `127.0.0.11` is Docker's embedded DNS and does not exist on Kubernetes — point this at your cluster DNS or every `/api` request will fail to resolve |
| `SPIREX_MAX_BODY_SIZE` | `320m` | You accept larger uploads than the 300 MB video ceiling |

### Upgrading from a pre-published-image install

The server container now runs as the **non-root `node` user** (uid 1000). Docker seeds a *fresh* `server_uploads` volume with the right ownership automatically, so new installs need nothing. A volume created by an older root-only build is root-owned and the server will fail to write attachments into it. Fix it once:

```bash
docker compose run --rm --no-deps --user root server chown -R node:node /app/server/uploads
docker compose up -d
```

### Optional: MinIO object storage

By default uploads live on the `server_uploads` docker volume (`STORAGE_DRIVER=local`). To use S3-compatible object storage, set `STORAGE_DRIVER=minio` in `.env` and start with the profile:

```bash
docker compose --profile minio up -d
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
