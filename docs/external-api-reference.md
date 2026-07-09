# Spirex — External API reference

This is the complete API-key reference for external services that **read from**
and **write to** Spirex (stories, projects, sprints, epics, worklogs, comments).

- **Reading** — §1–§9 below: get a key, authenticate, `GET /api/auth/me`, fetch
  stories, response shapes, and the read endpoints.
- **Writing** — §10–§20 below: create issues, change status, assign, move
  sprints, worklogs, comments — with the permission model.

For the full end-to-end integration playbook — error handling, retries,
idempotency, security checklist — see the
[External API Guide](external-api-guide.md).

> **Base URL.** Every path below is under `/api`. In examples `https://your-host`
> stands in for your Spirex deployment, so the stories endpoint is
> `https://your-host/api/stories`.

---

## 1. Getting an API key

1. Log into Spirex as the user the external service will impersonate.
2. Go to **Profile** (top-right user menu → Profile, or `/profile`).
3. Scroll to **API Keys** → click **New key**.
4. Give it a name (e.g. `reporting-bot`), optionally pick an expiry date, and
   click **Create key**.
5. **Copy the key immediately.** It is shown ONCE. After you close the dialog,
   only its prefix (`rjk_xxxxxxxx…`) is ever visible again. If you lose it,
   revoke it and create a new one.

Every action you perform with this key is attributed to the user who created
it — for audit, activity log, and permission purposes.

---

## 2. Authenticating requests

Send the key in the standard `Authorization` header using the `Bearer` scheme:

```
Authorization: Bearer rjk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

No cookies, no other headers needed. Use HTTPS in any non-local environment.

The API server enforces the **same project permissions** for API-key callers
as it does for browser sessions. If the key's owner is not a member of the
project you're querying (and isn't an admin of the organization), you'll get a
`403`.

> **Single organization.** This edition of Spirex runs exactly one organization
> per deployment, so every key acts in that organization — there is no org to
> select and no extra header to send.

---

## 3. Find out who you're authenticated as

Your external service holds a key but it doesn't inherently know **which user**
that key belongs to. To filter stories by "my own", you first need that user's
ID. There's a single endpoint for it:

```
GET /api/auth/me
```

**Response**

```jsonc
{
  "user": {
    "id": "ckxyz...",                 // ← use this as `assigneeId` later
    "name": "Hassan Ali",
    "email": "hassan@example.com",
    "avatarUrl": null,
    "isSuperAdmin": false,
    "isExternal": false,
    "externalSource": null,
    "externalId": null,
    "disabledAt": null,
    "createdAt": "2026-04-21T06:37:33.000Z",
    "updatedAt": "2026-05-09T14:01:55.000Z"
  },
  "org": {
    "id": "ckorg_abc123",             // ← your deployment's organization
    "name": "Acme Inc",
    "slug": "acme",
    "status": "active",
    "maxUsers": 50,
    "logoUrl": "https://your-host/api/org/ckorg_abc123/logo",
    "url": "https://acme.example.com",
    "entitlements": { "...": "..." },
    "role": "admin"                   // ← the owner's role in the org: admin | member | external
  },
  "memberships": [
    {
      "id": "ckorg_abc123",
      "name": "Acme Inc",
      "slug": "acme",
      "status": "active",
      "logoUrl": "https://your-host/api/org/ckorg_abc123/logo",
      "role": "admin"
    }
    // Single-organization edition: this always contains exactly one entry —
    // the deployment's organization.
  ]
}
```

> **Heads up — there is no `user.globalRole`.** Older docs showed one; the
> field is no longer exposed. A user's authority lives in `org.role`. The only
> flag on `user` is `isSuperAdmin` (platform operator — not relevant to
> integrations).

**curl**

```bash
curl -H "Authorization: Bearer rjk_YOUR_KEY_HERE" \
  https://your-host/api/auth/me
```

**Node.js**

```js
const me = await fetch('https://your-host/api/auth/me', {
  headers: {
    Authorization: `Bearer ${process.env.SPIREX_API_KEY}`,
  },
}).then((r) => r.json());

const myUserId = me.user.id;     // ← plug into assigneeId
const myOrgId = me.org.id;       // ← the deployment's organization
```

> **Cache the result.** Your user ID doesn't change for the lifetime of the
> key, so call this once at startup, store `user.id` in memory, and reuse it.
> No need to hit `/me` on every request.

A `401` here is the cleanest way to **probe whether your key is still valid** —
if your key was revoked or expired, this endpoint will be the first to fail.

---

## 4. Fetching stories

**Endpoint**

```
GET /api/stories
```

**Required query parameter**

| Param        | Type   | Description                          |
|--------------|--------|--------------------------------------|
| `projectId`  | string | The project's ID (required)          |

**Common optional filters** (combine freely)

| Param         | Type     | Values / notes                                                                            |
|---------------|----------|-------------------------------------------------------------------------------------------|
| `assigneeId`  | string   | Filter by assigned user ID                                                                |
| `status`      | enum     | `backlog` \| `todo` \| `in_progress` \| `in_review` \| `qa` \| `done` \| `all`            |
| `statusId`    | string   | Filter by a **custom workflow column ID** (see §9 and §12 below)                          |
| `type`        | enum     | `story` \| `bug` \| `task`                                                                |
| `priority`    | enum     | `low` \| `medium` \| `high` \| `critical`                                                 |
| `sprintId`    | string   | Sprint ID; pass literal `null` for backlog-only                                           |
| `epicId`      | string   | Epic ID; pass literal `null` for stories with no epic                                     |
| `search`      | string   | Substring match on title and key                                                          |
| `parentStoryId` | string | Pass literal `null` for top-level only                                                    |
| `includeSubtasks` | bool | `true` \| `false` (defaults to hiding subtasks)                                           |

> **`status` vs `statusId`.** `status` matches one of the six fixed core
> statuses (plus `all`). `statusId` matches a **specific custom workflow
> column** — use it when a project has renamed/added columns and the core enum
> isn't precise enough. List a project's columns via
> `GET /api/projects/:projectId/workflow` (§9).

Returns up to **200** stories matching the filters, ordered by `rank` then
`createdAt`. There is no offset/page cursor — narrow with filters rather than
paging.

---

## 5. Examples

### The main use case: my own in-progress stories, in a project

This shows the full flow — discover the user ID via `/auth/me`, then use it as
`assigneeId`. In practice you'd cache the user ID after the first call.

**curl** (two steps)

```bash
# 1) Who am I? — grab the id field from the response.
curl -H "Authorization: Bearer rjk_YOUR_KEY_HERE" \
  https://your-host/api/auth/me

# 2) My stories in this project that are in progress.
curl -G \
  -H "Authorization: Bearer rjk_YOUR_KEY_HERE" \
  --data-urlencode "projectId=PROJECT_ID" \
  --data-urlencode "assigneeId=USER_ID_FROM_STEP_1" \
  --data-urlencode "status=in_progress" \
  https://your-host/api/stories
```

**Node.js (fetch)** — `/me` first, then list:

```js
const SPIREX = 'https://your-host';
const HEADERS = {
  Authorization: `Bearer ${process.env.SPIREX_API_KEY}`,
};

// 1) Find out who we're authenticated as. Cache this — it doesn't change.
const meRes = await fetch(`${SPIREX}/api/auth/me`, { headers: HEADERS });
if (!meRes.ok) throw new Error(`auth/me ${meRes.status}`);
const { user } = await meRes.json();
const myUserId = user.id;

// 2) Fetch this user's in-progress stories in a given project.
const res = await fetch(
  `${SPIREX}/api/stories?` +
    new URLSearchParams({
      projectId: 'PROJECT_ID',
      assigneeId: myUserId,
      status: 'in_progress',
    }),
  { headers: HEADERS },
);
if (!res.ok) throw new Error(`stories ${res.status}: ${await res.text()}`);

const { stories } = await res.json();
console.log(`${user.name} has ${stories.length} in-progress stories.`);
```

**Python (requests)** — same flow:

```python
import os
import requests

BASE = "https://your-host"
HEADERS = {
    "Authorization": f"Bearer {os.environ['SPIREX_API_KEY']}",
}

# 1) Who am I?
me = requests.get(f"{BASE}/api/auth/me", headers=HEADERS, timeout=30)
me.raise_for_status()
my_user_id = me.json()["user"]["id"]

# 2) My in-progress stories.
resp = requests.get(
    f"{BASE}/api/stories",
    headers=HEADERS,
    params={
        "projectId": "PROJECT_ID",
        "assigneeId": my_user_id,
        "status": "in_progress",
    },
    timeout=30,
)
resp.raise_for_status()
stories = resp.json()["stories"]
```

---

## 6. Response shape

Each story carries its raw foreign-key IDs **and** lightweight hydrated objects
for the related assignee, reporter and epic, so you usually don't need a second
call to resolve names.

```jsonc
{
  "stories": [
    {
      "id": "ckxyz...",
      "projectId": "ckabc...",
      "key": "PROJ-42",
      "title": "Wire up reporting dashboard",
      "description": "…",
      "acceptanceCriteria": "…",
      "type": "story",
      "status": "in_progress",          // one of the six core statuses
      "statusId": "ckworkflow...",       // custom workflow column ID, or null
      "priority": "medium",
      "storyPoints": 5,
      "originalEstimateMinutes": 120,    // or null
      "assigneeId": "ckuser...",
      "reporterId": "ckuser...",
      "sprintId": "cksprint...",
      "epicId": null,
      "parentStoryId": null,
      "source": null,                    // provenance marker for imported/agent-created issues
      "rank": 1024,                      // manual ordering rank
      "createdAt": "2026-05-01T10:23:11.000Z",
      "updatedAt": "2026-05-09T14:01:55.000Z",

      // Hydrated relations (present on list + detail responses):
      "assignee": { "id": "ckuser...", "name": "…", "email": "…", "avatarUrl": null, "isExternal": false },
      "reporter": { "id": "ckuser...", "name": "…", "email": "…", "avatarUrl": null, "isExternal": false },
      "epic": null,                      // or { id, key, title, color }
      "_count": { "subtasks": 0, "outgoingLinks": 0 }
    }
  ]
}
```

> Treat the response as **additive** — Spirex may add fields over time. Read the
> fields you need by name; don't assume the object is exactly this set.

---

## 7. Error responses

All errors come back as JSON with an `error` field and an HTTP status:

```json
{ "error": "Invalid or expired API key" }
```

| Status | Meaning                                                              |
|--------|----------------------------------------------------------------------|
| `400`  | Bad request — missing/invalid `projectId`, malformed query           |
| `401`  | Missing, invalid, expired, or revoked API key                        |
| `403`  | Key is valid, but its owner doesn't have access to that project/org  |
| `404`  | Resource doesn't exist                                               |
| `500`  | Server-side error — retry with backoff                               |

> A `403` on a project you *know* exists means the key owner isn't a member of
> that project (and isn't an org admin) — fix the owner's role, not the request.

---

## 8. Security — please read

- **Never commit the key** to source control. Use environment variables or a
  secret manager.
- **Treat it like a password.** Anyone with the key can act as the user who
  owns it.
- **Revoke immediately** if you suspect it leaked (Profile → API Keys → trash
  icon next to the key).
- **Prefer a dedicated user** for each integration — easier to audit and
  revoke without affecting humans. Give it the **narrowest** project/org
  membership it needs.
- **Set an expiry date** for keys that are only needed temporarily.

The server records `lastUsedAt` on every authenticated request, so you can
check from the Profile page whether a key is still in use.

---

## 9. Other useful read endpoints

All endpoints accept the same `Authorization: Bearer` header. Some examples
relevant to read-only integrations:

| Method | Path                                       | Purpose                                  |
|--------|--------------------------------------------|------------------------------------------|
| GET    | `/api/projects`                            | List projects in the organization        |
| GET    | `/api/projects/:id`                        | Project detail                           |
| GET    | `/api/projects/:projectId/workflow`        | Custom workflow columns for a project    |
| GET    | `/api/stories/:id`                         | Single story by ID                       |
| GET    | `/api/stories/by-key/:key`                 | Single story by key (`PROJ-42`)          |
| GET    | `/api/stories/:id/activity`                | Story activity log                       |
| GET    | `/api/comments/by-story/:storyId`          | Comments on a story                      |
| GET    | `/api/worklogs/by-story/:storyId`          | Worklogs on a story                      |
| GET    | `/api/sprints?projectId=…`                 | Sprints in a project                     |
| GET    | `/api/epics?projectId=…`                   | Epics in a project                       |

**Workflow columns** — `GET /api/projects/:projectId/workflow` returns:

```jsonc
{
  "workflow": [
    {
      "id": "ckworkflow...",       // ← this is the statusId / statusRowId
      "projectId": "ckabc...",
      "coreStatus": "in_progress", // which of the six core statuses it maps to
      "label": "In Progress",
      "color": "#64748B",
      "order": 2,
      "category": "in_progress",   // todo | in_progress | done
      "wipLimit": null,
      "isDefault": true,
      "createdAt": "…",
      "updatedAt": "…"
    }
  ]
}
```

Use a row's `id` as `statusId` when filtering stories (§4) or as `statusRowId`
when moving a story to a custom column (§12 below).

---

## 10. Writing — permission model (read this first)

Authentication is identical to reading: send `Authorization: Bearer rjk_xxx…`
on every request (§1–§2 above). Need to know which user your key represents
(e.g. to set yourself as assignee)? Call `GET /api/auth/me` (§3 above).

The API key acts as the user who created it. Two things decide what writes are
allowed, and **either one** can grant an action:

1. **The owner's role in the organization** (`admin` | `member` |
   `external`). An **org `admin`** can do everything — including on projects
   they aren't an explicit member of. `member` and `external` get almost
   nothing org-wide (they can create/view projects at most); their write
   power comes from project roles.
2. **The owner's role on the specific project** (`viewer` | `reporter` |
   `developer` | `lead`). This is resolved per project.

| Project role | Can write?                                          |
|--------------|-----------------------------------------------------|
| `viewer`     | No — read-only                                      |
| `reporter`   | Create stories, comment, log work                   |
| `developer`  | All of the above + edit, change status, assign      |
| `lead`       | All of the above + delete, move sprints, manage     |

So a write is permitted if the key owner is an **org admin** **OR** holds a
high-enough **project role**.

If a write call returns **`403 Forbidden`**, the usual cause is that the
owner's **project role** is too low → promote them on the project (or use a
key from a higher-role user). The API itself is fine — it's a role issue.

---

## 11. Change a story's status (the main write use case)

This is the simplest and most common write — flip a story between the six core
statuses: `backlog` / `todo` / `in_progress` / `in_review` / `qa` / `done`.

**Endpoint**

```
PATCH /api/stories/:id/status
```

**Body**

```json
{ "status": "in_progress" }
```

Valid values: `backlog`, `todo`, `in_progress`, `in_review`, `qa`, `done`.

**Required project role**: `developer` or higher (or org admin).

**curl**

```bash
curl -X PATCH \
  -H "Authorization: Bearer rjk_YOUR_KEY_HERE" \
  -H "Content-Type: application/json" \
  -d '{"status":"in_progress"}' \
  https://your-host/api/stories/STORY_ID/status
```

**Node.js**

```js
const res = await fetch(
  `https://your-host/api/stories/${storyId}/status`,
  {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${process.env.SPIREX_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ status: 'in_progress' }),
  },
);
if (!res.ok) throw new Error(`Spirex ${res.status}: ${await res.text()}`);
const { story } = await res.json();
```

**Response** — `200 OK` with the full updated story:

```jsonc
{
  "story": {
    "id": "ckxyz...",
    "key": "PROJ-42",
    "status": "in_progress",
    /* …all other story fields, same shape as §6 above… */
  }
}
```

Each status change is recorded automatically in the story's activity log,
attributed to the key's owner.

---

## 12. Move a story to a custom workflow column

If the project has custom workflow columns configured (renamed/reordered/added
statuses), move directly to a specific column by its ID:

```
PATCH /api/stories/:id/status-row
```

```json
{ "statusRowId": "ckworkflow123..." }
```

The `statusRowId` is a workflow column's `id`. Find the available columns for a
project via:

```
GET /api/projects/:projectId/workflow
```

…which returns rows of the shape documented in §9 above (`id`, `coreStatus`,
`label`, `category`, `order`, …). Use this when the simple six-value enum in
§11 isn't expressive enough for your project's board. Required role:
`developer`+ (or org admin).

Returns `200 OK` with `{ "story": { … } }`.

---

## 13. Update other fields on a story

For everything besides status — title, description, assignee, priority, story
points, epic, parent, etc.

```
PATCH /api/stories/:id
```

**Body** (all fields optional, send only what you want to change):

```jsonc
{
  "title": "Updated title",            // 1–200 chars
  "description": "Long-form description, up to 10,000 chars",
  "acceptanceCriteria": "Given X, when Y, then Z",  // up to 10,000 chars
  "priority": "high",                  // low | medium | high | critical
  "type": "story",                     // story | bug | task
  "storyPoints": 5,                    // 0–100, or null
  "originalEstimateMinutes": 120,      // 0+, or null
  "assigneeId": "ckuser...",           // or null to unassign
  "epicId": "ckepic...",               // or null
  "parentStoryId": null,               // or another story ID
  "reporterId": "ckuser..."            // change who reported it
}
```

Required role: `developer` for general edits. Changing `assigneeId` is governed
by the `story:assign` permission (also held by `developer`+ and org admins).

**curl**

```bash
curl -X PATCH \
  -H "Authorization: Bearer rjk_YOUR_KEY_HERE" \
  -H "Content-Type: application/json" \
  -d '{"priority":"high","assigneeId":"ckuser..."}' \
  https://your-host/api/stories/STORY_ID
```

Returns `200 OK` with `{ "story": { … } }`.

---

## 14. Create a new story

```
POST /api/stories
```

**Body**

```jsonc
{
  "projectId": "ckproject...",        // REQUIRED
  "title": "New thing to do",         // REQUIRED, 1–200 chars
  "description": "Details…",          // up to 10,000 chars
  "acceptanceCriteria": "…",          // up to 10,000 chars
  "type": "task",                     // default: story
  "priority": "medium",               // default: medium
  "storyPoints": 3,                   // 0–100, or null
  "originalEstimateMinutes": 60,      // 0+, or null
  "epicId": null,
  "assigneeId": null,
  "parentStoryId": null               // set to a story ID to create a subtask
}
```

`reporterId` is set automatically to the key's owner — don't send it.
New stories default to `1` story point if you omit `storyPoints`.
Required role: `reporter`+ (or org admin).

**Response** — `201 Created` with the new story:

```json
{ "story": { "id": "...", "key": "PROJ-43", /* … */ } }
```

> The `key` (e.g. `PROJ-43`) is generated server-side. Capture it from the
> response if you need to reference the issue back in your external system.

---

## 15. Move a story between sprints

```
PATCH /api/stories/:id/sprint
```

```json
{ "sprintId": "cksprint..." }
```

Send `{ "sprintId": null }` to move the story back to the backlog. Required
role: `developer`+ (or org admin). Returns `200 OK` with `{ "story": { … } }`.

---

## 16. Delete a story

```
DELETE /api/stories/:id
```

Returns `204 No Content`. Required role: `lead` (or org admin). **Irreversible**
— prefer moving to a `done` status if you don't truly need to remove it.

---

## 17. Worked hours (worklogs)

If your external service tracks time and you want to log it back:

```
POST /api/worklogs
```

```jsonc
{
  "storyId": "ckstory...",
  "timeSpent": "1h 30m",                    // human grammar, parsed server-side
  "startedAt": "2026-05-11T09:30:00.000Z",  // optional, ISO 8601
  "description": "Implemented endpoint"     // optional, up to 2,000 chars
}
```

> **`timeSpent` is a string, not a number.** Use Jira-style duration grammar
> like `"2h 30m"`, `"45m"`, `"1d"`, `"3h"` — the server parses it into minutes.
> Sending a raw number of minutes (e.g. `timeSpentMinutes: 90`) will fail
> validation with a `400`.

Required role: `reporter`+ (or org admin). Returns `201 Created` with
`{ "worklog": { … } }`.

---

## 18. Comments

```
POST /api/comments
```

```jsonc
{
  "storyId": "ckstory...",
  "body": "Status synced from external system at 2026-05-11T10:00Z"
}
```

The comment text field is `body` (1–10,000 chars). Required role: `reporter`+
(or org admin). Returns `201 Created` with `{ "comment": { … } }`. Useful for
leaving an audit trail from the external system on the story itself, on top of
the automatic activity log.

---

## 19. Error responses (writes)

Same shape as the read API (§7) — `{ "error": "..." }` with an HTTP status:

| Status | Meaning                                                                    |
|--------|----------------------------------------------------------------------------|
| `400`  | Validation failed (e.g. invalid `status` value, missing `title`, numeric `timeSpent`) |
| `401`  | Missing, invalid, expired, or revoked API key                              |
| `403`  | Key valid, but the owner lacks the required project role                   |
| `404`  | Story / project / sprint not found                                         |
| `409`  | Conflict (e.g. transition not allowed by current state)                    |
| `500`  | Server error — retry with exponential backoff                              |

---

## 20. End-to-end example: bidirectional status sync

A common integration pattern — when a deployment finishes in your CI, mark all
`in_review` stories assigned to the bot as `done`:

```js
import 'dotenv/config';

const SPIREX = 'https://your-host';
const HEADERS = {
  Authorization: `Bearer ${process.env.SPIREX_API_KEY}`,
  'Content-Type': 'application/json',
};

async function listInReview(projectId, assigneeId) {
  const res = await fetch(
    `${SPIREX}/api/stories?` +
      new URLSearchParams({ projectId, assigneeId, status: 'in_review' }),
    { headers: HEADERS },
  );
  if (!res.ok) throw new Error(`list failed: ${res.status}`);
  const { stories } = await res.json();
  return stories;
}

async function markDone(storyId) {
  const res = await fetch(`${SPIREX}/api/stories/${storyId}/status`, {
    method: 'PATCH',
    headers: HEADERS,
    body: JSON.stringify({ status: 'done' }),
  });
  if (!res.ok) throw new Error(`update ${storyId} failed: ${res.status}`);
  return (await res.json()).story;
}

const stories = await listInReview('PROJECT_ID', 'USER_ID');
for (const s of stories) {
  const updated = await markDone(s.id);
  console.log(`${updated.key} → ${updated.status}`);
}
```

That round-trips through the same audit/activity system as the UI — your CI
shows up as the user in every story's activity log, with timestamps.
