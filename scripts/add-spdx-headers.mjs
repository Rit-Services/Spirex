#!/usr/bin/env node
// Stamp an SPDX license header onto every first-party source file.
//
//   node scripts/add-spdx-headers.mjs           # apply
//   node scripts/add-spdx-headers.mjs --check    # CI mode: exit 1 if any file is missing the header (no writes)
//
// Idempotent: a file that already carries the SPDX line is left untouched, so
// this is safe to run repeatedly and to wire into a pre-commit hook or CI.
//
// It deliberately skips node_modules, build output, generated Prisma client,
// and non-source assets — you only license code you actually authored.

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SPDX_ID = 'AGPL-3.0-only';
const COPYRIGHT = 'Copyright (C) RIT Services and contributors';

// Repo root = parent of this script's directory.
const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');

// Only these roots are scanned — first-party source lives here.
const SCAN_DIRS = ['client/src', 'server'];

// Directory names pruned anywhere in the tree.
const SKIP_DIRS = new Set([
  'node_modules', 'dist', 'build', '.next', 'coverage',
  'playwright-report', 'test-results', 'uploads', 'generated', '.git',
]);

// Extension → line-comment prefix. Only line-commentable code is stamped.
const COMMENT = {
  '.ts': '//', '.tsx': '//', '.js': '//', '.jsx': '//', '.mjs': '//', '.cjs': '//',
};

const checkOnly = process.argv.includes('--check');

/** Recursively collect stampable files under `dir`. */
function collect(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out; // dir may not exist in a partial checkout
  }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      collect(full, out);
    } else if (COMMENT[extname(name)] && !name.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

/** Build the two-line header block for a given comment prefix. */
function header(prefix) {
  return `${prefix} SPDX-License-Identifier: ${SPDX_ID}\n${prefix} ${COPYRIGHT}\n`;
}

const files = SCAN_DIRS.flatMap((d) => collect(join(ROOT, d)));
const missing = [];
let stamped = 0;

for (const file of files) {
  const src = readFileSync(file, 'utf8');
  if (src.includes('SPDX-License-Identifier')) continue; // already licensed

  missing.push(relative(ROOT, file));
  if (checkOnly) continue;

  const prefix = COMMENT[extname(file)];
  // Preserve a shebang line if present (executable scripts): header goes after it.
  let body = src;
  let shebang = '';
  if (body.startsWith('#!')) {
    const nl = body.indexOf('\n');
    shebang = body.slice(0, nl + 1);
    body = body.slice(nl + 1);
  }
  writeFileSync(file, shebang + header(prefix) + '\n' + body);
  stamped++;
}

if (checkOnly) {
  if (missing.length) {
    console.error(`Missing SPDX header in ${missing.length} file(s):`);
    for (const f of missing) console.error(`  ${f}`);
    console.error('\nRun: node scripts/add-spdx-headers.mjs');
    process.exit(1);
  }
  console.log(`All ${files.length} source files carry an SPDX header.`);
} else {
  console.log(`Stamped ${stamped} file(s); ${files.length - stamped} already had a header.`);
}
