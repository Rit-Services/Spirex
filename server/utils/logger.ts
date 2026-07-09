// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

type Level = 'error' | 'warn' | 'info' | 'debug';

const levels: Record<Level, number> = { error: 0, warn: 1, info: 2, debug: 3 };
const current = levels[(process.env.LOG_LEVEL as Level) ?? 'info'] ?? levels.info;

const format = (level: Level, args: unknown[]) => [
  `[${new Date().toISOString()}] [${level.toUpperCase()}]`,
  ...args,
];

const emit = (level: Level) => (...args: unknown[]) => {
  if (levels[level] > current) return;
  const t = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  t(...format(level, args));
};

export default {
  error: emit('error'),
  warn: emit('warn'),
  info: emit('info'),
  debug: emit('debug'),
};
