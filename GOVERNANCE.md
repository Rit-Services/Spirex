# SPIREX — Project Governance & Roles

This document defines **who can do what** in the SPIREX project, and **how roles
are granted**. It exists so responsibility is explicit: nobody has to guess who
reviews a PR or who is allowed to merge it.

SPIREX is owned by the **`Rit-Services`** GitHub organization.

## Roles at a glance

| Role | GitHub permission | Can review PRs | Can **merge** to `main` | Can manage people | Who |
|------|-------------------|:--------------:|:-----------------------:|:-----------------:|-----|
| **Owner** | Org Owner + repo Admin | ✅ | ✅ | ✅ | @Hassan-RIT |
| **Maintainer** | `Maintain` (via team) | ✅ | ✅ | ⛔ | assigned via team |
| **Triager** | `Triage` (via team) | ✅ (non-binding) | ⛔ | ⛔ | optional |
| **Contributor** | *no access* — forks & PRs | ⛔ | ⛔ | ⛔ | anyone |

> The **only** way code reaches `main` is a pull request that (a) passes CI and
> (b) is approved by an Owner or Maintainer listed in
> [`.github/CODEOWNERS`](./.github/CODEOWNERS). Nobody pushes to `main` directly
> — not even the Owner. Branch protection enforces this.

### What each role means

- **Owner** — the org owner (@Hassan-RIT). Final authority. Manages org
  settings, teams, branch protection, releases, and adds/removes maintainers.
  There should be very few owners (1–2).
- **Maintainer** — people who review and **merge** PRs and help triage issues.
  They do *not* manage org membership.
- **Triager** — can label, assign, and close issues/PRs but **cannot merge**.
  Useful for helping manage issues without granting merge rights.
- **Contributor** — everyone else. They **fork**, make a branch, and open a
  **pull request**. They never get write access — this is the default for
  anyone outside the org.

## How contributors contribute (no access needed)

This is already documented in [CONTRIBUTING.md](./CONTRIBUTING.md). In short:
fork → branch → PR. GitHub auto-requests a review from the code owner, CI runs,
and a Maintainer or Owner merges once it's green and approved.

## How to ADD a maintainer (recommended: teams)

Because SPIREX lives in an org, manage maintainers with a **team**, not by
adding people one at a time.  Current team is Rit for mainating the code of spirex