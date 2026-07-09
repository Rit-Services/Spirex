# Email (SMTP)

SPIREX sends transactional email — invites, mentions, issue updates, sprint completion, weekly digests, password resets — over SMTP. It is **optional**.

> If `SMTP_HOST` is blank, sending is disabled. The app still works: invite links are returned in the API response so an admin can copy/paste them manually.

## Configuration

```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true                 # true for 465; false for 587 (STARTTLS)
SMTP_USER=you@your-domain.com
SMTP_PASSWORD=<smtp password / app password>
SMTP_FROM=SPIREX <no-reply@your-domain.com>
```

## Gmail / Google Workspace

Gmail does **not** accept your normal account password over SMTP — you must create an **App Password** (requires 2-Step Verification enabled):

1. Google Account → **Security** → **2-Step Verification** (enable it).
2. **App passwords** → generate one for "Mail".
3. Use it as `SMTP_PASSWORD`:

```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=you@gmail.com          # or your Workspace address
SMTP_PASSWORD=<16-char app password>
SMTP_FROM=SPIREX <you@gmail.com>
```

Reference: <https://support.google.com/accounts/answer/185833>.

## Other providers

Any SMTP relay works — point `SMTP_HOST`/`SMTP_PORT` at it and use the credentials it gives you. For providers that offer an API key as the SMTP password, set `SMTP_USER` to whatever the provider specifies and `SMTP_PASSWORD` to the key. Make sure `SMTP_FROM` uses a domain you're allowed to send from, or messages will be rejected.
