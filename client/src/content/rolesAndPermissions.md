# SPIREX — Roles & Permissions Manual

*A plain-language guide for non-technical users. It explains who can see what,
who can create or change things, and how the screen looks different depending
on a person's role.*

---

## 1. The big idea: one organisation, three layers of access

Each SPIREX deployment hosts **one organisation** (your company / workspace).
It is created automatically the first time the server starts, from the
`ADMIN_EMAIL` / `ADMIN_PASSWORD` you configured — along with your first
administrator account. Everyone you add joins **this** organisation; there is
no second organisation to create or switch to.

A person's access is decided at **three** levels:

1. **Platform level — the Superadmin.** The person operating the SPIREX
   *installation itself* (usually whoever runs the server). They look after the
   organisation's seat limit, status, and other operator settings — but they
   are not part of the day-to-day project work.

2. **Organisation level — your Organisation Role.** Inside the organisation you
   have a role: **Admin**, **Member**, or **External**. It answers questions
   like *"Can this person start a new project?"* or *"Can this person manage
   the organisation's people and settings?"*

3. **Project level — your Project Role.** Decided separately *for each project*
   you're added to: **Lead**, **Developer**, **Reporter**, or **Viewer**. The
   same person can be a Lead on Project A and only a Viewer on Project B.

Think of it like your company's office building:

- The **Superadmin** is the building's caretaker — they keep the building
  running, but they don't sit in your meetings.
- Your **Organisation Role** is your standing inside the company — whether
  you're a manager, regular staff, or a visiting guest.
- Your **Project Role** is which *rooms* you can enter, and what you may touch
  once inside.

Your final ability to do something is the **combination of your organisation
role and your project role**. If *either* allows an action, you can do it.

> **Key point:** "Admin", "Member", and "External" describe your role in the
> organisation. The only platform-wide role is **Superadmin**.

---

## 2. The Superadmin (platform operator)

The **Superadmin** looks after the SPIREX *installation*, not the work inside
the organisation. A Superadmin can:

- Manage the **organisation** (seat limit, status, logo).
- Manage the organisation's **members** on the operator console.
- Manage other **Superadmins**.

The organisation itself is created **once, automatically, on first run** — this
edition of SPIREX runs a single organisation per deployment, and the server
will refuse to create a second one.

A Superadmin works from a **separate dashboard** and does **not** see ordinary
project screens (boards, backlogs, issues) — those belong to the organisation.
Likewise, organisation users never see the Superadmin dashboard. The two worlds
are deliberately kept apart.

You will almost never need a Superadmin for everyday work — the organisation's
Admin runs everything inside it.

---

## 3. Organisation Roles

Inside the organisation, every person has **one** of three roles:
**Admin**, **Member**, or **External**.

| Organisation Role | Who it's for | Start new projects? | Import from Jira? | Manage the org's people & settings? |
|-------------------|--------------|---------------------|-------------------|-------------------------------------|
| **Admin**    | The person running this organisation | Yes | Yes | **Yes** |
| **Member**   | Regular internal staff | Yes | Yes | No |
| **External** | Clients / outside collaborators | No | No | No |

### Admin (Organisation Admin)
The most powerful role **within an organisation**. An Admin can act in **every
project in that organisation**, whether or not they were formally added to it —
their organisation pass already covers it. An Admin also manages the
organisation's **people** (adding and inviting members, setting their roles)
and the organisation's **settings** (its name, web address, and logo).

An Admin's power stops at the edge of the organisation. They are **not** a
Superadmin and cannot touch the platform's operator settings.

### Member
The standard role for internal staff. A Member can **start new projects** and
**import data from Jira** within the organisation. But inside any *specific*
project, a Member can only do what their **project role** there allows. A Member
with no project role on a project is essentially a spectator there.

### External
The "client" role, for people outside your organisation. An External user
**cannot start new projects** and **cannot import from Jira**. They can only see
and work inside the specific projects they've been **invited into**, and only to
the extent their **project role** in each one allows.

---

## 4. Project Roles

When someone is added to a project, they are given **one** of these four roles
*for that project*. They are listed from most powerful to least.

| Project Role | One-line summary |
|--------------|------------------|
| **Lead**      | Runs the project. Full control. |
| **Developer** | Does the day-to-day work — creates and updates stories, logs time. |
| **Reporter**  | Can raise new stories and comment, but not change existing work. |
| **Viewer**    | Read-only. Can look, but not change anything. |

### Lead
Complete control of that project: edit project settings, delete the project,
manage who is on the team, create and delete epics/stories, run the full sprint
cycle (create, start, complete), customise the project's workflow, manage
who gets emailed about project updates, and delete attachments.

### Developer
The "doer" role. A Developer can create and edit stories, change a story's
status, assign stories to people, move stories between sprints, create and edit
epics, log work time, comment, upload attachments, and view reports.

A Developer **cannot**: delete stories, delete epics, manage the sprint cycle
(create / start / complete / delete sprints), edit project settings, delete the
project, or customise the workflow. Those are Lead-only.

### Reporter
A "light contributor" role — ideal for stakeholders who need to raise issues but
should not change ongoing work. A Reporter can **create new stories**, **add
comments**, **upload attachments**, and **view reports**.

A Reporter **cannot**: edit existing stories, change a story's status, assign
stories, work with epics or sprints, or log work time.

### Viewer
Pure read-only access. A Viewer can open the project, look at the board, the
backlog, stories and reports, and see the member list — but **cannot create or
change anything at all**. (Everyone, including a Viewer, can still manage *their
own* email-update preferences for the project.)

---

## 5. What each role can do — full capability table

"O" = granted by an **Organisation** role. "P" = granted by a **Project** role.
A blank cell means *not allowed*. (The Superadmin is not shown — it manages
the installation, not the work inside a project.)

| Capability | Org Admin | Member | External | Lead | Developer | Reporter | Viewer |
|------------|:---------:|:------:|:--------:|:----:|:---------:|:--------:|:------:|
| Manage the organisation's people | O | | | | | | |
| Manage organisation settings (name, logo) | O | | | | | | |
| Create a new project | O | O | | | | | |
| Import from Jira | O | O | | P | P | | |
| View a project | O | O | O | P | P | P | P |
| Edit project settings | O | | | P | | | |
| Delete a project | O | | | P | | | |
| Manage project members | O | | | P | P | P | P* |
| Create / edit epics | O | | | P | P | | |
| Delete epics | O | | | P | | | |
| Create stories | O | | | P | P | P | |
| Edit stories | O | | | P | P | | |
| Change a story's status | O | | | P | P | | |
| Assign stories to people | O | | | P | P | | |
| Delete stories | O | | | P | | | |
| Move stories between sprints | O | | | P | P | | |
| Create / start / complete / delete sprints | O | | | P | | | |
| Log work time (worklogs) | O | | | P | P | | |
| Add comments | O | | | P | P | P | |
| View reports | O | | | P | P | P | P |
| Upload attachments | O | | | P | P | P | |
| Delete attachments | O | | | P | | | |
| Customise the workflow | O | | | P | | | |
| Define custom fields | O | | | P | | | |

\* **About "Manage project members" for lower roles:** *everyone* on a project
can open the member list. But *changing* a member's role is limited by your own
level — see Section 7. In practice a Viewer can do almost nothing here.

> **Important:** Where a role has an "O", it applies across the whole
> organisation. An Org Admin has an "O" on every project row, so they can do
> everything in every project even without a project role. A Member only has
> the few "O" rows (create projects, import, view); everything else depends on
> their project role.

---

## 6. How the screen looks different per role

SPIREX hides buttons and pages you cannot use, so the app stays uncluttered. If
you don't see a button described below, it's because your role doesn't allow that
action — it isn't a bug.

### Platform vs. organisation
- A **Superadmin** lands on a dedicated **platform dashboard** (the organisation
  and superadmins) and does not see project screens. Everyone else lands inside
  the organisation and never sees the platform dashboard.

### Things only an **Organisation Admin** sees
- A **people / users** area for the organisation (add, invite, and set roles for
  members of *this* organisation).
- An **Organisation settings** page to edit the organisation's name, web address,
  and logo.
- On the **Worklogs** screen, an Admin sees *everyone's* logged time in the
  organisation. A non-admin sees only their *own*.

### Things gated by being able to **import from Jira**
- The **"Import from Jira"** sidebar link only appears for people allowed to
  import (Org Admins, Members, and project Leads/Developers). For everyone else
  the link is hidden and the import screen cannot be opened.

### Things gated by being able to **create projects**
- The **"Create Project"** button only appears for Org Admins and Members.
  External users never see it.

### Inside a project — buttons that appear or disappear
- **"Create Story"** — visible only to Leads, Developers, and Reporters.
- **"Create Sprint"** and the **Start / Complete Sprint** buttons — Leads only.
- **Editing a story** — edit controls appear only for Leads and Developers; a
  Reporter or Viewer sees the story as read-only.
- **Dragging stories** — moving a story to a new status or into a sprint works
  only for Leads and Developers.
- **Bulk-delete stories** — Leads only.
- **Assigning a story** — Leads and Developers only.
- **Upload attachment** — active for Leads, Developers, and Reporters; off for
  Viewers.
- **Project Settings** — any member can open it to manage their own email-update
  preferences, but the **Details**, **Workflow**, **Custom fields**, and
  **Danger Zone (delete project)** sections appear only for the roles allowed to
  use them (mostly Leads). A Lead can also set email-update preferences for the
  whole team from the Members list.

### What the **External** (client) role sees
An External user sees a trimmed-down app: no "Create Project" button and no
"Import from Jira" link. They see only the projects they were invited to, and
within each project they behave according to the project role they were given
there. An External user *can* be made a Lead or Developer on a project — the
"External" label only restricts organisation-wide actions, not what they do
inside a project they belong to.

---

## 7. Member management — the "level" rule

Project roles have a ranking, from highest to lowest:

**Lead (4) → Developer (3) → Reporter (2) → Viewer (1)**

When you add a person to a project or change their role, you can only assign a
role **at or below your own level**. This stops people from promoting others (or
themselves) above their own authority.

- A **Lead** can assign any role, including another Lead.
- A **Developer** can assign Developer, Reporter, or Viewer — but not Lead.
- A **Reporter** can assign Reporter or Viewer.
- A **Viewer** can effectively only deal with other Viewers.
- An **Organisation Admin** bypasses this entirely and can assign anyone any
  role.

You also cannot change or remove a member who **outranks** you — their role is
shown to you as a plain badge you can't edit.

---

## 8. Quick reference — common scenarios

| Situation | Recommended setup |
|-----------|-------------------|
| The person running your company's workspace | Organisation **Admin** |
| Your project manager | Organisation **Member** + Project **Lead** |
| A developer on the team | Organisation **Member** + Project **Developer** |
| A QA / tester raising bugs | Organisation **Member** + Project **Reporter** |
| A stakeholder who only wants to watch progress | Organisation **Member** + Project **Viewer** |
| A client who should see only their project | Organisation **External** + Project **Viewer** (or **Reporter** if they should raise requests) |
| The person operating the SPIREX installation itself | **Superadmin** |

---

## 9. Frequently asked questions

**Q: What's the difference between an Admin and a Superadmin?**
An **Organisation Admin** runs the organisation — its people, its settings, and
all its projects. A **Superadmin** runs the *installation* — the organisation's
seat limit, status, and operator settings — but doesn't take part in its
projects.

**Q: Can I create a second organisation?**
No. This edition of SPIREX runs **one organisation per deployment** — it's
created automatically on first run, and the server refuses to create another.
If you need a fully separate workspace, run a separate SPIREX deployment.

**Q: I'm a Member but I can't edit stories in a project. Why?**
Being an organisation Member only lets you create projects and import from Jira.
Inside a project you need a project role — ask the project Lead to add you as a
Developer.

**Q: A button I expected is missing.**
SPIREX hides actions your role can't perform. A missing button almost always
means your role doesn't permit that action, not that something is broken.

**Q: Can a Developer delete a story they created by mistake?**
Not through the normal delete — deleting stories is Lead-only. However, a person
can always delete an **attachment they uploaded themselves**. Ask a Lead to
remove an unwanted story.

**Q: Does an Org Admin need to be added to a project to manage it?**
No. An Org Admin has full control of every project **in their organisation**
automatically.

**Q: Can an External (client) user run a sprint?**
Only if they were given the **Lead** role on that specific project. The
"External" label restricts organisation-wide actions (new projects, Jira
import), not what they do inside a project they belong to.
