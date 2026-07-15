# Security Policy

We take the security of SPIREX and the people who self-host it seriously. Thank
you for helping keep it and its users safe.

## Supported versions

SPIREX is pre-1.0 and moves quickly. Security fixes are applied to the **latest
release on the `main` branch**. If you run an older checkout, please update
before reporting.

| Version | Supported |
|---------|-----------|
| `main` (latest) | ✅ |
| older tags | ❌ (please upgrade) |

## Reporting a vulnerability

**Please do not report security vulnerabilities through public GitHub issues,
pull requests, or discussions.**

Instead, report privately via either:

- **GitHub Security Advisories** — the *"Report a vulnerability"* button under
  this repository's **Security** tab (preferred), or
- **Email** — **spirex@rit.services**

Please include as much of the following as you can:

- The type of issue (e.g. auth bypass, injection, SSRF, privilege escalation).
- The affected file(s), endpoint(s), or component(s).
- Step-by-step instructions to reproduce, and a proof-of-concept if possible.
- The impact — what an attacker could achieve.

## What to expect

- **Acknowledgement** within **3 business days**.
- An initial assessment and severity triage within **10 business days**.
- We'll keep you updated on remediation progress and coordinate a disclosure
  timeline with you. We aim to ship a fix before any public disclosure and are
  happy to credit you (or keep you anonymous — your call).

## Scope

In scope: the code in this repository (client, server, deployment config).

Out of scope: vulnerabilities in third-party dependencies (report those
upstream), and any hosted service or instance you do not own. **Do not** test
against instances you don't control, and never access, modify, or exfiltrate
data that isn't yours.

## A note for self-hosters

You are responsible for the security of your own deployment — rotate the
default admin credentials, set strong `JWT_SECRET` / `ENCRYPTION_KEY` values,
terminate TLS in front of the app, keep your database and object storage
private, and encrypt your disks at the infrastructure layer. See
[docs/self-hosting.md](./docs/self-hosting.md) for hardening guidance.
