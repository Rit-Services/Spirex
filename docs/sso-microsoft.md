# Microsoft SSO (Entra ID)

SPIREX supports **Sign in with Microsoft** via OIDC (authorization code + PKCE). It is **optional** and **off** until both a client id and secret are set — until then, the login screen shows password login only.

> SPIREX is invite-only. SSO **authenticates existing accounts** (matched by the immutable Entra `oid`); it never creates a new user. Invite a person first, then they can sign in with Microsoft using the same email.

## 1. Register an app in Entra

1. Azure Portal → **Microsoft Entra ID** → **App registrations** → **New registration**.
2. Add a **Web** redirect URI that exactly matches what SPIREX will use:
   - Docker default: `http://localhost/api/auth/sso/microsoft/callback`
   - Local dev: `http://localhost:4000/api/auth/sso/microsoft/callback`
   - Production: `https://your-domain/api/auth/sso/microsoft/callback`
3. **Certificates & secrets** → **New client secret** → copy the *value*.
4. Copy the **Application (client) ID** and, if single-tenant, the **Directory (tenant) ID**.

## 2. Configure SPIREX

```bash
MS_CLIENT_ID=<application (client) id>
MS_CLIENT_SECRET=<client secret value>
MS_TENANT_ID=common     # see below
MS_REDIRECT_URI=http://localhost/api/auth/sso/microsoft/callback   # must EXACTLY match step 2
```

### `MS_TENANT_ID` — single vs multi-tenant

- A concrete **directory (tenant) GUID** → locks sign-in to that one tenant, and its token's email claim is trusted for first-time auto-linking.
- `common` / `organizations` / `consumers` → accept accounts from any tenant. First-time auto-linking then additionally requires a verified-email signal on the token (`xms_edov` / `email_verified`); otherwise the user must link Microsoft from **Profile → Connected accounts** while signed in.

## 3. Use it

Once configured and restarted, the login screen shows a **Continue with Microsoft** button, and users can link/unlink Microsoft from their profile. The redirect URI in Entra must always match `MS_REDIRECT_URI` character-for-character, or Microsoft returns an error before reaching SPIREX.
