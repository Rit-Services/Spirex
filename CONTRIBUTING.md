# Contributing to SPIREX

First off — thank you. SPIREX is an open-source, self-hostable Jira alternative,
and it gets better because people like you file issues, improve docs, and send
patches.

By contributing to this repository, you agree that your contributions are
licensed under the project's [GNU AGPL-3.0](./LICENSE) license (inbound =
outbound). Please also read our [Code of Conduct](./CODE_OF_CONDUCT.md).

## Ways to contribute

- **Report a bug** — open a GitHub issue with steps to reproduce, what you
  expected, and what happened.
- **Request a feature** — open an issue describing the problem you're trying to
  solve (not just the solution).
- **Improve the docs** — fixes to anything under [`docs/`](./docs) are always
  welcome.
- **Send code** — see the setup and pull-request flow below.

> ⚠️ **Security issues are different.** Do **not** open a public issue for a
> vulnerability — follow [SECURITY.md](./SECURITY.md) instead.

## Development setup

**Prerequisites**

- Node.js **>= 20** and npm
- PostgreSQL 16 (or use the bundled `docker compose` stack)
- Docker + Docker Compose (optional, but the fastest way to run everything)

**Get it running**

```bash
# 1. Install (npm workspaces: client + server)
npm install

# 2. Configure environment
cp server/env.example server/.env
cp .env.example .env            # root — used by docker compose
#   Fill in DATABASE_URL, ADMIN_EMAIL/ADMIN_PASSWORD, and (optionally) AI/SMTP.
#   See docs/self-hosting.md for the full walkthrough.

# 3. Apply database migrations
npm run migrate:deploy

# 4a. Run with Docker (postgres + server + frontend)
docker compose up --build
#     — or —
# 4b. Run locally in two terminals
npm run dev:server
npm run dev:client
```

On first boot the server creates a single admin from `ADMIN_EMAIL` /
`ADMIN_PASSWORD` (idempotent — it never overwrites an existing user). Add
everyone else from inside the app.

More detail lives in the docs: [self-hosting](./docs/self-hosting.md),
[AI providers](./docs/ai-providers.md), [storage](./docs/storage.md),
[Microsoft SSO](./docs/sso-microsoft.md), [email/SMTP](./docs/email-smtp.md).

## Project layout

| Path | What |
|------|------|
| `client/` | React + Vite single-page app |
| `server/` | Express API + Prisma (PostgreSQL) |
| `docs/`   | Self-hosting, AI, storage, SSO, external API |
| `nginx/`  | Reverse-proxy config baked into the client image |

## Tests

End-to-end tests run with Playwright:

```bash
npm run test:e2e
```

Please make sure the suite passes before opening a PR, and add coverage for
behavior you change.

## Coding standards

- **TypeScript** throughout — keep it typed; no new `any` unless truly
  unavoidable.
- Match the **existing style** of the file you're editing (naming, structure,
  comment density). Run the workspace lint/format before committing.
- Keep pull requests **small and focused** — one logical change per PR is far
  easier to review and merge.

## Commit & pull-request flow

1. Fork the repo and create a topic branch off `main`
   (`feat/labels-color-picker`, `fix/import-epic-link`).
2. Write clear commits using **[Conventional Commits](https://www.conventionalcommits.org/)**
   (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`).
3. Ensure the app builds and `npm run test:e2e` passes.
4. **Never commit secrets** — no real API keys, passwords, or `.env` files.
   `*.env.example` files hold placeholders only.
5. Open a PR describing *what* changed and *why*, and link any related issue.

A maintainer will review as soon as they can. Thanks for helping make SPIREX
better!
