# Spirex — External API Integration Guide

A production-grade playbook for building an external service against the Spirex
API. The API reference gets you a first successful call:

- [external-api-reference.md](external-api-reference.md) — the full reference: reading (§1–§9) and
  writing (§10–§20) — stories, projects, sprints, status, worklogs, comments.

**This guide is the next layer**: how to design a robust, secure integration
that won't surprise you in production. Read the quickstarts first;
this assumes you know the basic request shape.

---

## 1. Mental model (one minute)

The objects you care about nest like this (this edition of Spirex runs a
single organization per deployment):

```
Organization
└── Project              ← has a fixed type: scrum | kanban
    ├── Workflow columns ← custom statuses mapped onto 6 core statuses
    ├── Sprints
    ├── Epics
    └── Stories          ← "issues": story | bug | task (+ subtasks)
        ├── Comments
        └── Worklogs
```

An **API key** impersonates exactly one **user**. That user has an org-wide
role, and may hold a different **project role** in each project. So "what can
this key do" is always answered as:

> *Org role* **+** *project role on the target project*.

Internalize that and the rest of the API is predictable.

---

## 2. The two identity primitives

| Primitive            | Where it comes from                | What it controls                          |
|----------------------|------------------------------------|-------------------------------------------|
| **API key**          | Profile → API Keys (`spx_…`)       | *Who* you are (a single user)             |
| **Roles**            | org role + per-project role        | *What* you're allowed to do               |

### 2.1 Bootstrapping at startup

Call `GET /api/auth/me` once at startup and cache:

```jsonc
{
  "user":        { "id": "...", "name": "...", "email": "..." },   // your identity
  "org":         { "id": "...", "role": "admin", "...": "..." },   // the org + your role in it
  "memberships": [ { "id": "...", "role": "member" } ]             // always exactly one entry
}
```

Cache `user.id` (for `assigneeId`/`reporterId`). It doesn't change for the
key's lifetime. Re-fetch only on a `401` (see §4).

---

## 3. Permissions cheat-sheet

A write is allowed if the owner is an **org admin** OR has a sufficient
**project role**. Minimums per operation:

| Operation                          | Endpoint                              | Min project role |
|------------------------------------|---------------------------------------|------------------|
| Read stories/projects/sprints/…    | `GET …`                               | `viewer`         |
| Create story / comment / worklog   | `POST /api/stories` etc.              | `reporter`       |
| Edit story / change status / assign| `PATCH /api/stories/:id[...]`         | `developer`      |
| Move sprint                        | `PATCH /api/stories/:id/sprint`       | `developer`      |
| Delete story                       | `DELETE /api/stories/:id`             | `lead`           |
| Edit workflow columns              | `PUT /api/projects/:id/workflow` etc. | `lead`           |

> **Least privilege.** Give the integration's user the lowest project role that
> covers its job. A status-sync bot needs `developer`; a "create issues from
> support emails" bot needs only `reporter`.

---

## 4. Error handling that won't bite you

Every error is `{ "error": "message" }` plus an HTTP status. Build your client
around these:

| Status | Treat as…                  | Action                                                              |
|--------|----------------------------|---------------------------------------------------------------------|
| `400`  | Bug in your request        | Don't retry. Log the body and fix the payload.                      |
| `401`  | Key dead/invalid           | Stop. Alert. Re-auth / rotate the key. **Never** retry in a loop.   |
| `403`  | Permission                 | Don't retry blindly. Check the owner's org/project role first.      |
| `404`  | Gone or never existed      | Reconcile your local state; the resource may have been deleted.     |
| `409`  | Conflict (state/transition)| Re-read the resource, then decide; safe to retry after reconciling. |
| `429`* | Rate limited (if enabled)  | Back off; honour `Retry-After` if present.                          |
| `5xx`  | Server-side                | Retry with **exponential backoff + jitter**, capped attempts.       |

\* If your deployment fronts the API with a gateway/rate limiter.

**Retry policy (recommended):** retry only on `5xx` (and `429`). Use exponential
backoff with jitter — e.g. `min(30s, 0.5s · 2^attempt) ± random`, max ~5
attempts. Treat `4xx` as terminal except where noted.

```js
async function call(req, { maxAttempts = 5 } = {}) {
  let attempt = 0;
  for (;;) {
    const res = await fetch(req.url, req.init);
    if (res.ok) return res;
    const retriable = res.status >= 500 || res.status === 429;
    if (!retriable || ++attempt >= maxAttempts) {
      throw new Error(`${req.init.method ?? 'GET'} ${req.url} → ${res.status}: ${await res.text()}`);
    }
    const base = Math.min(30_000, 500 * 2 ** attempt);
    await new Promise((r) => setTimeout(r, base * (0.5 + Math.random())));
  }
}
```

---

## 5. Idempotency & avoiding duplicates

The API does **not** dedupe creates for you — two `POST /api/stories` calls make
two issues. For at-least-once pipelines (webhooks, retried jobs):

- **Keep a local mapping** `externalId → spirexStoryId`. Before creating, check
  it. After a successful create, persist the returned `story.id` **and** `key`.
- **Make the external ref visible in Spirex.** Put your external system's ID in
  the description or a comment (`POST /api/comments`) so a human can trace it and
  so you can `search` for it as a fallback.
- **Search before create** as a safety net:
  `GET /api/stories?projectId=…&search=YOUR_EXTERNAL_REF`.
- **Updates are naturally idempotent.** `PATCH …/status` to the same value twice
  is harmless — prefer "set desired state" over "apply a delta".

---

## 6. Reading efficiently

- **`GET /api/stories` returns up to 200 rows, no paging cursor.** Narrow with
  filters (`projectId` + `status`/`assigneeId`/`sprintId`/`epicId`) instead of
  trying to page. If you genuinely need everything, iterate by `sprintId` or by
  `status`, or by `epicId`, to keep each result set under the cap.
- **Use the hydrated relations.** List responses embed `assignee`, `reporter`,
  and `epic` objects plus a `_count` — you rarely need a second round-trip to
  resolve names.
- **Custom workflows:** if a project renamed/added board columns, filter with
  `statusId` (a workflow column `id`) rather than the core `status` enum. Fetch
  the columns from `GET /api/projects/:projectId/workflow`.
- **Cache slow-changing data** (project lists, workflow columns, user IDs).
  Refresh on a schedule or on `404`/`409`, not on every request.

---

## 7. Writing safely

- **Set desired state, don't compute deltas.** Idempotent and resync-friendly.
- **Status:** use `PATCH …/status` for the six core statuses; use
  `PATCH …/status-row` with a `statusRowId` for custom columns.
- **Worklog time is a string** — `"2h 30m"`, not a number. (See writes §7.)
- **Don't send `reporterId` on create** — it's auto-set to the key owner.
- **Capture the returned `key`** (`PROJ-43`) and store it against your external
  record for traceability.
- **Everything is attributed to the key's owner** in the activity log. Use a
  clearly-named dedicated user (e.g. `CI Bot`) so the audit trail reads well.

---

## 8. Security checklist

- [ ] Key stored in a secret manager / env var — **never** in source control.
- [ ] **Dedicated user** per integration, with least-privilege project roles.
- [ ] **Expiry date** set on keys that are temporary.
- [ ] HTTPS everywhere outside local dev.
- [ ] Rotation runbook: how to mint a new key, swap it in, and revoke the old
      one with zero downtime (mint → deploy → revoke).
- [ ] Monitor `lastUsedAt` (Profile → API Keys) to spot dead or rogue keys.
- [ ] On any `401`, alert a human — a silently-broken integration is worse than
      a loud one.

---

## 9. Pre-flight verification (before you ship)

Run these once with your real key against a staging deployment:

```bash
# 0) Sanity: is the API up?
curl -s https://your-host/api/health

# 1) Identity. Confirm user.id and org.id are what you expect.
curl -s -H "Authorization: Bearer $KEY" \
  https://your-host/api/auth/me

# 2) Can I see the project?
curl -s -H "Authorization: Bearer $KEY" \
  https://your-host/api/projects

# 3) Read a slice of stories.
curl -sG -H "Authorization: Bearer $KEY" \
  --data-urlencode "projectId=$PROJECT" --data-urlencode "status=todo" \
  https://your-host/api/stories

# 4) Round-trip write: create → read back → (optionally) delete.
curl -s -X POST -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d "{\"projectId\":\"$PROJECT\",\"title\":\"API smoke test\"}" \
  https://your-host/api/stories
```

If step 2 returns an empty list but you *know* the user has projects, the key
owner isn't a member of them — fix their membership before anything else.

---

## 10. Endpoint index

**Read** (full details in [external-api-reference.md §1–§9](external-api-reference.md)):

| Method | Path                                  |
|--------|---------------------------------------|
| GET    | `/api/auth/me`                        |
| GET    | `/api/projects`                       |
| GET    | `/api/projects/:id`                   |
| GET    | `/api/projects/:projectId/workflow`   |
| GET    | `/api/stories`                        |
| GET    | `/api/stories/:id`                    |
| GET    | `/api/stories/by-key/:key`            |
| GET    | `/api/stories/:id/activity`           |
| GET    | `/api/comments/by-story/:storyId`     |
| GET    | `/api/worklogs/by-story/:storyId`     |
| GET    | `/api/sprints?projectId=…`            |
| GET    | `/api/epics?projectId=…`              |

**Write** (full details in [external-api-reference.md §10–§20](external-api-reference.md)):

| Method | Path                              | Min role   |
|--------|-----------------------------------|------------|
| POST   | `/api/stories`                    | reporter   |
| PATCH  | `/api/stories/:id`                | developer  |
| PATCH  | `/api/stories/:id/status`         | developer  |
| PATCH  | `/api/stories/:id/status-row`     | developer  |
| PATCH  | `/api/stories/:id/sprint`         | developer  |
| DELETE | `/api/stories/:id`                | lead       |
| POST   | `/api/worklogs`                   | reporter   |
| POST   | `/api/comments`                   | reporter   |

---

## 11. Quick reference: gotchas

1. **No `user.globalRole`.** Roles are org-level (`org.role`) and per-project.
2. **`timeSpent` is a string** (`"2h 30m"`), not minutes.
3. **`reporterId` is auto-set** on create — don't send it.
4. **200-row cap** on `GET /api/stories`, no paging — filter narrowly.
5. **Creates aren't deduped** — keep an `externalId → storyId` map.
6. **A `403` on a known-good project** means the key owner's role is too low.
7. **Responses are additive** — read fields by name, tolerate new ones.
