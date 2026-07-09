// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

// Only mark the auth cookie `Secure` when the app is actually served over HTTPS.
// A `Secure` cookie is never sent back over plain HTTP, which would break auth on
// every request after login for anyone self-hosting over http:// (localhost or an
// internal network). Derived from CLIENT_URL's scheme so HTTP just works; force it
// with COOKIE_SECURE=true when behind a TLS-terminating proxy, or =false to opt out.
const cookieSecureEnv = (process.env.COOKIE_SECURE || '').toLowerCase();
const cookieSecure =
  cookieSecureEnv === 'true'
    ? true
    : cookieSecureEnv === 'false'
      ? false
      : (process.env.CLIENT_URL || '').startsWith('https://');

export const config = {
  jwt: {
    secret: process.env.JWT_SECRET || 'dev_only_insecure_secret',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    cookieName: 'spirex_token',
  },
  encryption: {
    // Secret used to derive the AES-256-GCM key that encrypts stored
    // third-party secrets (e.g. saved JIRA API tokens). Falls back to
    // JWT_SECRET so dev works out of the box; set a dedicated ENCRYPTION_KEY
    // in production — rotating JWT_SECRET would otherwise orphan saved tokens.
    key: process.env.ENCRYPTION_KEY || '',
  },
  cookie: {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: cookieSecure,
    path: '/',
  },
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true',
    user: process.env.SMTP_USER || '',
    password: process.env.SMTP_PASSWORD || '',
    from: process.env.SMTP_FROM || 'SPIREX <no-reply@spirex.local>',
  },
  invites: {
    ttlHours: Number(process.env.INVITE_TTL_HOURS || 168),
  },
  sso: {
    microsoft: {
      clientId: process.env.MS_CLIENT_ID || '',
      clientSecret: process.env.MS_CLIENT_SECRET || '',
      /**
       * Entra tenant segment of the authority URL. A directory (tenant) ID
       * locks sign-in to that single tenant AND makes its tokens inherently
       * trustworthy for email matching. 'common' / 'organizations' accept any
       * work account — then auto-link additionally requires a verified-email
       * signal on the token (xms_edov / email_verified).
       */
      tenant: process.env.MS_TENANT_ID || 'common',
      redirectUri:
        process.env.MS_REDIRECT_URI ||
        'http://localhost:4000/api/auth/sso/microsoft/callback',
    },
  },
  internal: {
    // Shared secret the in-cluster CronJob presents (X-Internal-Token) to call
    // protected internal endpoints. Empty → internal endpoints are disabled.
    apiToken: process.env.INTERNAL_API_TOKEN || '',
  },
  claude: {
    /**
     * 'anthropic' | 'litellm' | 'auto'. Both transports use a plain API key.
     * In 'auto' the runner prefers litellm when LITELLM_BASE_URL is set (opt-in
     * to your own OpenAI-compatible model), else the direct Anthropic API.
     * Shared knobs (timeout, model, maxTokens) apply to both, so LiteLLM reuses
     * CLAUDE_TIMEOUT_MS / CLAUDE_MAX_TOKENS and falls back to CLAUDE_MODEL.
     */
    mode: (process.env.CLAUDE_MODE || 'auto').toLowerCase(),
    /** Anthropic Messages API key (anthropic mode). https://console.anthropic.com */
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    /** Hard timeout for any single AI invocation, ms */
    timeoutMs: Number(process.env.CLAUDE_TIMEOUT_MS || 120000),
    /** Model id — REQUIRED for anthropic mode (e.g. 'claude-sonnet-4-5'). */
    model: process.env.CLAUDE_MODEL || '',
    /** Cap on response length. */
    maxTokens: Number(process.env.CLAUDE_MAX_TOKENS || 4096),
  },
  litellm: {
    /**
     * Base URL of an OpenAI-compatible endpoint (a LiteLLM proxy). Setting this
     * is what switches SPIREX off Claude and onto your own model in 'auto'
     * mode. Must point at the OpenAI-compatible root the proxy exposes (the SDK
     * appends '/chat/completions'). Empty → litellm transport disabled.
     */
    baseUrl: process.env.LITELLM_BASE_URL || '',
    /** Virtual key / api key the proxy expects. Sent as the Bearer token. */
    apiKey: process.env.LITELLM_API_KEY || '',
    /**
     * Model name the proxy routes on (e.g. 'gpt-4o', 'claude-3-5-sonnet', or a
     * proxy alias). Falls back to CLAUDE_MODEL so a single model var can serve
     * both transports.
     */
    model: process.env.LITELLM_MODEL || process.env.CLAUDE_MODEL || '',
  },
} as const;

export const isMailerConfigured = (): boolean => Boolean(process.env.SMTP_HOST);
