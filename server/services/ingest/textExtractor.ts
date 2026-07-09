// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export async function extractText(buffer: Buffer, mimetype: string): Promise<string> {
  if (mimetype === 'application/pdf') {
    // pdf-parse is CJS; loaded via createRequire for ESM compatibility
    const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string }>;
    const result = await pdfParse(buffer);
    return result.text ?? '';
  }

  if (mimetype === DOCX_MIME) {
    const mammoth = require('mammoth') as {
      extractRawText: (opts: { buffer: Buffer }) => Promise<{ value: string }>;
    };
    const result = await mammoth.extractRawText({ buffer });
    return result.value ?? '';
  }

  // text/plain, text/markdown, text/x-markdown, or extension-based fallback — pass through as UTF-8
  return buffer.toString('utf8');
}
