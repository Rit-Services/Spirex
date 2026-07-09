# AI providers

SPIREX can draft issues and acceptance criteria, enhance existing issues, and generate issues from documents/images. All of this is **optional** and uses a plain **API key**. There are two transports.

> **If no provider is configured, AI features are automatically hidden in the UI** — no broken buttons, no errors. The rest of the app works exactly the same.

Which transport is used is decided by `CLAUDE_MODE`:

| `CLAUDE_MODE` | Transport |
|---|---|
| `anthropic` | Anthropic API directly |
| `litellm` | Any OpenAI-compatible endpoint / LiteLLM proxy |
| `auto` (default) | `litellm` if `LITELLM_BASE_URL` is set, otherwise `anthropic` |

Shared knobs: `CLAUDE_TIMEOUT_MS` (default 120000), `CLAUDE_MAX_TOKENS` (default 4096).

## Option A — Anthropic API

Get a key from <https://console.anthropic.com>. A model id is **required** (the API has no default).

```bash
CLAUDE_MODE=anthropic          # or leave as 'auto'
ANTHROPIC_API_KEY=sk-ant-...
CLAUDE_MODEL=claude-sonnet-4-5 # any current Anthropic model id
```

Vision-capable models are required for **image import**; text-only models still power enhancement and document import.

## Option B — LiteLLM / OpenAI-compatible

Point SPIREX at any OpenAI-compatible endpoint (a [LiteLLM](https://docs.litellm.ai) proxy, a local model server, etc.). This lets you run SPIREX against **any** model — OpenAI, a self-hosted OSS model, or Anthropic-via-proxy.

```bash
CLAUDE_MODE=litellm            # or 'auto' (set automatically when BASE_URL is present)
LITELLM_BASE_URL=https://litellm.mycompany.com   # OpenAI-compatible root; SDK appends /chat/completions
LITELLM_API_KEY=sk-...         # the proxy virtual key
LITELLM_MODEL=gpt-4o           # model / alias the proxy routes on (falls back to CLAUDE_MODEL)
```

For image import the configured model must be vision-capable.

## Where AI is used

- **Enhance issue** — rewrite title/description/acceptance-criteria for clarity.
- **Draft acceptance criteria** — generate criteria for an existing issue.
- **Import from document / image** — turn a spec doc or screenshot into a drafted issue (you always review before saving).

Each is gated so that turning AI off (no keys) simply removes the entry points.
