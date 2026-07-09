// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import OpenAI, { APIError } from 'openai';
import type {
  ChatCompletionContentPart,
  ChatCompletionMessageParam,
} from 'openai/resources/chat/completions';
import { config } from '../../config/index.js';
import logger from '../../utils/logger.js';

/**
 * True when an API error looks like the model/proxy refusing the
 * `response_format` (JSON mode) param rather than a real fault — so we can
 * safely retry the same request without it. A 400 with the param named, or any
 * mention of json_object / response_format, qualifies.
 */
function isUnsupportedJsonModeError(err: APIError): boolean {
  if (err.status && err.status !== 400 && err.status !== 422) return false;
  const msg = `${err.message ?? ''}`.toLowerCase();
  return (
    msg.includes('response_format') ||
    msg.includes('json_object') ||
    msg.includes('json mode') ||
    (msg.includes('not support') && msg.includes('json'))
  );
}

/**
 * Run a prompt against an OpenAI-compatible endpoint (a LiteLLM proxy) via the
 * official OpenAI SDK. LiteLLM speaks the OpenAI Chat Completions wire format,
 * so the only things that change per deployment are the base URL, key and
 * model — all read from config so a restart re-reads env vars with no redeploy.
 *
 * Image support uses the standard multimodal `image_url` content part with a
 * data: URI. It only works when the configured model is vision-capable; for the
 * text-only flows (voice import, enhance) `imageBase64` is omitted and a plain
 * string message is sent.
 */
export async function runLiteLLM(input: {
  system: string;
  user: string;
  imageBase64?: string;
  mimetype?: string;
}): Promise<string> {
  if (!config.litellm.baseUrl) {
    throw new Error('LITELLM_BASE_URL is not set — cannot use litellm mode');
  }
  if (!config.litellm.model) {
    throw new Error('LITELLM_MODEL (or CLAUDE_MODEL) is not set — cannot use litellm mode');
  }

  const client = new OpenAI({
    apiKey: config.litellm.apiKey || 'no-key',
    baseURL: config.litellm.baseUrl.replace(/\/$/, ''),
    timeout: config.claude.timeoutMs,
    // The runner's callers already surface a clean 503; one retry covers a
    // transient blip without multiplying the timeout into a long stall.
    maxRetries: 1,
  });

  const userContent: string | ChatCompletionContentPart[] = input.imageBase64
    ? [
        { type: 'text', text: input.user },
        {
          type: 'image_url',
          image_url: {
            url: `data:${input.mimetype || 'image/png'};base64,${input.imageBase64}`,
          },
        },
      ]
    : input.user;

  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: input.system },
    { role: 'user', content: userContent },
  ];

  // Every caller wants strict JSON back. `response_format: json_object`
  // constrains the model to emit syntactically valid JSON (escaped newlines, no
  // markdown fences, no prose) — which is exactly the class of breakage we hit
  // on non-Claude models that put literal line breaks inside string values.
  // Not every model behind the proxy supports it, so we ask for it and, if the
  // proxy rejects the param, retry once without it (the hardened parser is the
  // backstop for those models).
  const baseParams = {
    model: config.litellm.model,
    max_tokens: config.claude.maxTokens,
    messages,
  };

  try {
    let choice: { message?: { content?: string | null }; finish_reason?: string | null } | undefined;
    try {
      const res = await client.chat.completions.create({
        ...baseParams,
        response_format: { type: 'json_object' },
      });
      choice = res.choices[0];
    } catch (err) {
      if (err instanceof APIError && isUnsupportedJsonModeError(err)) {
        logger.warn('litellm: model rejected response_format=json_object, retrying without it');
        const res = await client.chat.completions.create(baseParams);
        choice = res.choices[0];
      } else {
        throw err;
      }
    }

    const output = choice?.message?.content;
    if (typeof output !== 'string' || output.trim() === '') {
      throw new Error('litellm proxy returned an empty completion');
    }
    // A 'length' finish means the model was cut off mid-answer — the JSON is
    // truncated and will never parse, and retrying produces the same cut-off.
    // Fail with an actionable message instead of a misleading "malformed JSON".
    if (choice?.finish_reason === 'length') {
      throw new Error(
        `litellm response was truncated (finish_reason=length, max_tokens=${config.claude.maxTokens}) — raise CLAUDE_MAX_TOKENS`,
      );
    }
    return output;
  } catch (err) {
    // The SDK throws APIError subclasses with status/message; normalise to a
    // plain Error so the caller's ErrorResponse wrapping stays uniform.
    if (err instanceof APIError) {
      throw new Error(`litellm proxy ${err.status ?? '???'}: ${err.message}`);
    }
    logger.error('litellm call failed', err);
    throw err;
  }
}
