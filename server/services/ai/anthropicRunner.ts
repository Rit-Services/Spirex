// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { config } from '../../config/index.js';
import logger from '../../utils/logger.js';

/**
 * Run a prompt against the Anthropic Messages API with a plain API key
 * (`ANTHROPIC_API_KEY`). This is the self-hostable "API-based Claude" path — no
 * CLI, no OAuth subscription, no external wrapper service. We call the HTTP
 * endpoint directly with `fetch` so there's no SDK dependency to pin.
 *
 * Vision uses the standard base64 image content block; it only works when the
 * configured model is vision-capable. Text-only flows (enhance) omit
 * `imageBase64` and send a plain string message.
 *
 * Docs: https://docs.anthropic.com/en/api/messages
 */
export async function runAnthropic(input: {
  system: string;
  user: string;
  imageBase64?: string;
  mimetype?: string;
}): Promise<string> {
  if (!config.claude.apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set — cannot use anthropic mode');
  }
  if (!config.claude.model) {
    throw new Error('CLAUDE_MODEL is not set — the Anthropic API requires an explicit model id');
  }

  const userContent = input.imageBase64
    ? [
        { type: 'text', text: input.user },
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: input.mimetype || 'image/png',
            data: input.imageBase64,
          },
        },
      ]
    : input.user;

  const controller = new AbortController();
  const killer = setTimeout(() => controller.abort(), config.claude.timeoutMs);

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': config.claude.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: config.claude.model,
        max_tokens: config.claude.maxTokens,
        system: input.system,
        messages: [{ role: 'user', content: userContent }],
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`anthropic api ${res.status}: ${body.slice(0, 500)}`);
    }

    const data = (await res.json()) as {
      content?: { type: string; text?: string }[];
      stop_reason?: string | null;
    };

    // Concatenate every text block (the Messages API returns an array of blocks).
    const output = (data.content ?? [])
      .filter((b) => b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text)
      .join('');

    if (output.trim() === '') {
      throw new Error('anthropic api returned an empty completion');
    }
    // A 'max_tokens' stop means the answer was cut off — the JSON is truncated
    // and will never parse; retrying reproduces it. Fail with an actionable hint.
    if (data.stop_reason === 'max_tokens') {
      throw new Error(
        `anthropic response was truncated (stop_reason=max_tokens, max_tokens=${config.claude.maxTokens}) — raise CLAUDE_MAX_TOKENS`,
      );
    }
    return output;
  } catch (err) {
    if ((err as { name?: string }).name === 'AbortError') {
      throw new Error(`anthropic api timed out after ${config.claude.timeoutMs}ms`);
    }
    logger.error('anthropic call failed', err);
    throw err;
  } finally {
    clearTimeout(killer);
  }
}
