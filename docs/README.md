# Spirex — Documentation

## External API (for third-party integrations)

Building an external service that reads from or writes to Spirex with an API
key? Start here:

| Doc | Read it for |
|-----|-------------|
| [External API — Reference](external-api-reference.md) | Get a key, authenticate, `GET /api/auth/me`, read endpoints (§1–§9), and all write endpoints — create, status, assign, sprints, worklogs, comments (§10–§20). |
| [External API — Guide](external-api-guide.md) | **Production playbook**: identity model, permissions, error handling & retries, idempotency, security checklist, pre-flight verification, gotchas. |

**Recommended path:** skim the integration guide's mental model (§1–2), then use
the reading and writing quickstarts as references while you build.

## Self-hosting & configuration

| Doc | Topic |
|-----|-------|
| [Self-hosting](self-hosting.md) | Run SPIREX with Docker or locally; first-run setup. |
| [AI providers](ai-providers.md) | Enable AI drafting via the Anthropic API or a LiteLLM / OpenAI-compatible proxy. |
| [Storage](storage.md) | Attachment storage: local disk, MinIO, or AWS S3. |
| [Microsoft SSO](sso-microsoft.md) | Sign-in with Microsoft Entra ID. |
| [Email (SMTP)](email-smtp.md) | Transactional email via SMTP (e.g. Gmail). |

## Feature docs

| Doc | Topic |
|-----|-------|
| [Document import](document-import.md) | Importing issues from documents. |
| [User story template](USER_STORY_TEMPLATE.md) | Story authoring template. |
