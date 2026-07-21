# SPIREX

**Open-source, self-hostable Jira alternative for small teams.** Scrum & Kanban boards, backlog, sprints, epics, subtasks, custom workflows, time tracking, reports, rich-text issues with attachments, one-click JIRA import, and optional AI drafting.

> _An open-source product by **[RIT Services](https://www.rit.services)** — [www.rit.services](https://www.rit.services)._

> ☁️ **Don't want to self-host?** Try the **free hosted version** at
> **[spirex.rit.services](https://spirex.rit.services)** — the cloud SPIREX, a
> free-tier Jira alternative, no setup required.
>
> 💬 **Questions, or something wrong?** Reach us at **[spirex@rit.services](mailto:spirex@rit.services)**.

---

## Quick start (Docker — one command)

Prereqs: Docker + Docker Compose. **No Node toolchain, no compile step** — the images are prebuilt.

```bash
cp .env.example .env   # then edit the secrets (JWT_SECRET, ENCRYPTION_KEY, DB password)
docker compose up -d   # pulls postgres + server + frontend
```

Open **http://localhost** and log in with the `ADMIN_EMAIL` / `ADMIN_PASSWORD` you set in `.env` — the first boot creates that single admin account (and its organization) automatically. Migrations run on boot. The admin then invites the team from the Users page. More: [docs/self-hosting.md](docs/self-hosting.md).

To use MinIO object storage instead of local disk, set `STORAGE_DRIVER=minio` in `.env` and start with `docker compose --profile minio up -d`.

### Public images

Published on every release for **linux/amd64** and **linux/arm64** (Apple Silicon, Raspberry Pi, Graviton):

```bash
docker pull ghcr.io/rit-services/spirex-server:latest
docker pull ghcr.io/rit-services/spirex-client:latest
```

| Tag | Meaning |
|---|---|
| `0.2.0` | An exact release. **Pin this in production.** |
| `0.2` / `0` | Latest patch / latest minor on that track |
| `latest` | Newest stable release — moves under you |
| `edge` | Every commit on `main`. Unstable, for testing only |

Pin a version for the whole stack by setting `SPIREX_VERSION` in `.env`. Every image is built by [GitHub Actions](.github/workflows/release.yml) and carries a signed provenance attestation, so you can verify it really came from this repository:

```bash
gh attestation verify oci://ghcr.io/rit-services/spirex-server:latest --repo Rit-Services/Spirex
```

Releases are cut automatically from [Conventional Commits](https://www.conventionalcommits.org/) — see [CONTRIBUTING.md](CONTRIBUTING.md#releases-are-automatic). Full history in [CHANGELOG.md](CHANGELOG.md).

### Building from source instead

Contributors, and anyone running a fork, layer the build override on top:

```bash
docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build
```

## Quick start (local dev)

Prereqs: Node 20+, npm 10+, a Postgres instance.

```bash
npm install
cp server/env.example server/.env      # set DATABASE_URL + secrets
cp client/env.example client/.env
npm run migrate:deploy && npm run seed  # from repo root
# two terminals:
npm run dev:server
npm run dev:client
```

Open **http://localhost:5173**.

## AI features are optional

AI drafting (issue enhancement, document & image import) works with a plain **API key**:

- **Anthropic** — set `ANTHROPIC_API_KEY` + `CLAUDE_MODEL`, or
- **LiteLLM / any OpenAI-compatible endpoint** — set `LITELLM_BASE_URL` (+ key + model).

If neither is configured, **AI features are automatically hidden in the UI** — the app runs fully without them. Details: [docs/ai-providers.md](docs/ai-providers.md).

## Configure

| Topic | Doc |
|---|---|
| Self-host from scratch | [docs/self-hosting.md](docs/self-hosting.md) |
| AI providers (Anthropic / LiteLLM) | [docs/ai-providers.md](docs/ai-providers.md) |
| Storage (local / MinIO / S3) | [docs/storage.md](docs/storage.md) |
| Microsoft SSO | [docs/sso-microsoft.md](docs/sso-microsoft.md) |
| Email (SMTP / Gmail) | [docs/email-smtp.md](docs/email-smtp.md) |
| External API | [docs/external-api-reference.md](docs/external-api-reference.md) · [docs/external-api-guide.md](docs/external-api-guide.md) |

## Layout

```
spirex/
├── client/   # React + Vite + TypeScript + Redux Toolkit
├── server/   # Express + Prisma + PostgreSQL
├── nginx/    # SPA + /api reverse-proxy template, rendered at container start
├── docs/
├── docker-compose.yml        # pulls the published images
└── docker-compose.build.yml  # override: build from source instead
```

## Tech stack

Vite · React · TypeScript · Tailwind · shadcn/ui (client) — Node · Express · Prisma · PostgreSQL (server) — S3/MinIO for attachments, SMTP for email, Microsoft Entra for optional SSO.

## License

Spirex is licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**.
See [LICENSE](LICENSE). © RIT Services and contributors.

Because Spirex is served over a network, AGPL-3.0 §13 applies: anyone who runs a
modified version as a network service must make the corresponding source available
to its users.

In practice, if you **fork Spirex and publish your own images**, rebuild the client
with your fork's URL so the in-app "Source code" link points at the source actually
running:

```bash
docker compose -f docker-compose.yml -f docker-compose.build.yml build \
  --build-arg VITE_SOURCE_URL=https://github.com/you/your-fork
```

The official images are unmodified builds of this repository, so they link here.
