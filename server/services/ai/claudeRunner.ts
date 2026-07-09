// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { config } from '../../config/index.js';
import { ErrorResponse } from '../../utils/errorResponse.js';
import {
  buildAcceptanceCriteriaPrompt,
  buildEnhancePrompt,
  buildPrompt,
  buildVoicePrompt,
  parseAcceptanceCriteria,
  parseGeneratedStory,
} from './promptBuilder.js';
import type { GeneratedStory, StoryEnhanceContext } from './promptBuilder.js';
import { runAnthropic } from './anthropicRunner.js';
import { runLiteLLM } from './litellmRunner.js';
import logger from '../../utils/logger.js';
import type { Annotation } from '../ingest/imageImportService.js';

/** How many times to ask the model before surfacing an error to the caller. */
const MAX_AI_ATTEMPTS = 3;

export type ClaudeMode = 'anthropic' | 'litellm';

function resolveMode(): ClaudeMode {
  const m = config.claude.mode;
  if (m === 'litellm') return 'litellm';
  if (m === 'anthropic') return 'anthropic';
  // 'auto' — litellm wins if a base URL is set (deliberate opt-in to your own
  // OpenAI-compatible model), else the direct Anthropic API.
  return config.litellm.baseUrl ? 'litellm' : 'anthropic';
}

/**
 * Single dispatch point for both transports. Both use the image fields when
 * present (vision), and both take a plain API key — no CLI, no OAuth. Centralising
 * this keeps the generation helpers below identical regardless of transport.
 */
function runByMode(input: {
  system: string;
  user: string;
  imageBase64?: string;
  mimetype?: string;
  filename?: string;
}): Promise<string> {
  switch (resolveMode()) {
    case 'litellm':
      return runLiteLLM(input);
    default:
      return runAnthropic(input);
  }
}

/**
 * Run a prompt and parse its output, retrying the whole round-trip up to
 * MAX_AI_ATTEMPTS times. Two distinct failure classes are retried because both
 * are commonly transient with LLMs:
 *   - transport error (timeout / 5xx / network) → 503 on final failure
 *   - unparseable output (model returned non-JSON / broken JSON) → 502 on final
 * A fresh call is non-deterministic, so a re-roll usually yields parseable
 * output. The model decides the transport per call (env vars at restart).
 */
async function generateParsed<T>(
  input: { system: string; user: string; imageBase64?: string; mimetype?: string; filename?: string },
  parse: (raw: string) => T,
): Promise<T> {
  const mode = resolveMode();
  let lastError: { kind: 'run' | 'parse'; message: string } | null = null;

  for (let attempt = 1; attempt <= MAX_AI_ATTEMPTS; attempt++) {
    let raw: string;
    try {
      raw = await runByMode(input);
    } catch (err) {
      lastError = { kind: 'run', message: (err as Error).message };
      logger.warn(
        `AI call failed (${mode} mode, attempt ${attempt}/${MAX_AI_ATTEMPTS}): ${lastError.message}`,
      );
      continue;
    }

    try {
      return parse(raw);
    } catch (err) {
      lastError = { kind: 'parse', message: (err as Error).message };
      logger.warn(
        `AI returned unparseable output (${mode} mode, attempt ${attempt}/${MAX_AI_ATTEMPTS}): ${lastError.message}`,
      );
    }
  }

  if (lastError?.kind === 'parse') {
    throw new ErrorResponse(
      `AI returned malformed output after ${MAX_AI_ATTEMPTS} attempts: ${lastError.message}`,
      502,
    );
  }
  throw new ErrorResponse(
    `AI generation failed (${mode} mode) after ${MAX_AI_ATTEMPTS} attempts: ${lastError?.message ?? 'unknown'}`,
    503,
  );
}

/**
 * Generate a single user story from an image + annotations using whichever
 * transport is configured. The transport is decided per-call so changes to env
 * vars at restart take effect with no code redeploy.
 */
export async function generateStoryFromImage(input: {
  imagePath: string;
  filename: string;
  imageBuffer: Buffer;
  mimetype: string;
  annotations: Annotation[];
}): Promise<GeneratedStory> {
  const { system, user } = buildPrompt({
    imagePath: input.imagePath,
    filename: input.filename,
    annotations: input.annotations,
  });
  return generateParsed(
    {
      system,
      user,
      imageBase64: input.imageBuffer.toString('base64'),
      mimetype: input.mimetype,
      filename: input.filename,
    },
    parseGeneratedStory,
  );
}

/**
 * Generate a single user story from a transcribed voice note. Mirrors
 * `generateStoryFromImage` but takes text input only — no attachment is
 * forwarded to the claude-http-service, which falls back to its text-only
 * path when `imageBase64` is omitted.
 */
export async function generateStoryFromVoice(input: {
  translatedText: string;
  originalText?: string | null;
  detectedLanguage?: string | null;
}): Promise<GeneratedStory> {
  const { system, user } = buildVoicePrompt(input);
  return generateParsed({ system, user }, parseGeneratedStory);
}

/**
 * Rewrite an existing ticket (title/description/acceptance criteria) for
 * clarity. Returns a DRAFT only — the caller never persists it directly; the
 * user reviews and confirms in the UI before anything is saved.
 */
export async function enhanceStory(input: StoryEnhanceContext): Promise<GeneratedStory> {
  const { system, user } = buildEnhancePrompt(input);
  return generateParsed({ system, user }, parseGeneratedStory);
}

/** Draft acceptance criteria for an existing ticket (draft only, never saved here). */
export async function generateAcceptanceCriteria(input: StoryEnhanceContext): Promise<string> {
  const { system, user } = buildAcceptanceCriteriaPrompt(input);
  return generateParsed({ system, user }, parseAcceptanceCriteria);
}

export const claudeRunner = {
  resolveMode,
  generateStoryFromImage,
  generateStoryFromVoice,
  enhanceStory,
  generateAcceptanceCriteria,
};
