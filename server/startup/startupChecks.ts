// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import logger from '../utils/logger.js';
import { config } from '../config/index.js';
import { prisma } from '../db/prisma.js';
import { storage, storageDriver } from '../services/storage/index.js';
import { claudeRunner } from '../services/ai/claudeRunner.js';

type Status = 'ok' | 'fail' | 'warn';

interface CheckResult {
  name: string;
  status: Status;
  detail: string;
}

const MARK: Record<Status, string> = {
  ok: '[ OK ]',
  fail: '[FAIL]',
  warn: '[WARN]',
};

async function checkDatabase(): Promise<CheckResult> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { name: 'Database', status: 'ok', detail: 'PostgreSQL reachable' };
  } catch (err) {
    return { name: 'Database', status: 'fail', detail: `connection failed: ${(err as Error).message}` };
  }
}

async function checkStorage(): Promise<CheckResult> {
  const label = storageDriver === 'minio' || storageDriver === 's3' ? 'MinIO/S3' : 'local disk';
  try {
    await storage.healthCheck();
    const target =
      'describe' in storage && typeof (storage as { describe?: unknown }).describe === 'function'
        ? (storage as { describe(): string }).describe()
        : process.env.UPLOADS_DIR ?? './uploads';
    return { name: 'Storage', status: 'ok', detail: `${label} (${target})` };
  } catch (err) {
    return { name: 'Storage', status: 'fail', detail: `${label} unavailable: ${(err as Error).message}` };
  }
}

async function checkAi(): Promise<CheckResult> {
  // Resolve through the runner so this report can never drift from the
  // transport actually used at request time. Both transports use a plain API
  // key — AI simply stays disabled (features surface "not configured") when
  // neither is set up, which is a valid self-host state, hence 'warn' not 'fail'.
  const mode = claudeRunner.resolveMode();

  if (mode === 'litellm') {
    const missing: string[] = [];
    if (!config.litellm.baseUrl) missing.push('LITELLM_BASE_URL');
    if (!config.litellm.model) missing.push('LITELLM_MODEL (or CLAUDE_MODEL)');
    if (missing.length) {
      return { name: 'AI (LiteLLM)', status: 'fail', detail: `litellm mode but missing ${missing.join(', ')}` };
    }
    const key = config.litellm.apiKey ? 'with key' : 'no key';
    // No network probe — the proxy's /health may require auth and a vision
    // model may be cold; a failed ping would falsely mark a healthy proxy down.
    return {
      name: 'AI (LiteLLM)',
      status: 'ok',
      detail: `litellm ${config.litellm.baseUrl} model='${config.litellm.model}' (${key}) — not probed at startup`,
    };
  }

  // anthropic mode
  if (!config.claude.apiKey) {
    return {
      name: 'AI (Anthropic)',
      status: 'warn',
      detail: 'ANTHROPIC_API_KEY not set — AI features disabled (set it or use LiteLLM)',
    };
  }
  if (!config.claude.model) {
    return { name: 'AI (Anthropic)', status: 'fail', detail: 'ANTHROPIC_API_KEY set but CLAUDE_MODEL is empty (a model id is required)' };
  }
  // No startup network probe — avoid spending a token on every boot.
  return {
    name: 'AI (Anthropic)',
    status: 'ok',
    detail: `anthropic api model='${config.claude.model}' — not probed at startup`,
  };
}

function checkMailer(): CheckResult {
  if (config.smtp.host) {
    return { name: 'Email (SMTP)', status: 'ok', detail: `configured — host=${config.smtp.host}` };
  }
  return {
    name: 'Email (SMTP)',
    status: 'warn',
    detail: 'not configured — invite links returned in API response only',
  };
}

/**
 * Probe every external dependency and print a single readable health block at
 * startup so a failed service is obvious without digging through logs.
 */
export async function runStartupChecks(): Promise<void> {
  const results: CheckResult[] = [
    ...(await Promise.all([checkDatabase(), checkStorage(), checkAi()])),
    checkMailer(),
  ];

  const pad = Math.max(...results.map((r) => r.name.length));
  logger.info('─── Service health ───────────────────────────────');
  for (const r of results) {
    const line = `${MARK[r.status]} ${r.name.padEnd(pad)}  ${r.detail}`;
    if (r.status === 'fail') logger.error(line);
    else if (r.status === 'warn') logger.warn(line);
    else logger.info(line);
  }

  const failed = results.filter((r) => r.status === 'fail').length;
  const warned = results.filter((r) => r.status === 'warn').length;
  const summary = failed
    ? `${failed} service(s) FAILED, ${warned} warning(s) — see above`
    : warned
      ? `all critical services up, ${warned} warning(s)`
      : 'all services healthy';
  logger.info(`─── ${summary} ───`);
}
