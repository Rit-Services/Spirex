// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

/**
 * Build the public org-logo URL for an `<img>` to render.
 *
 * The URL is keyed by the (stable) org id, but the stored file is replaced
 * in place on every upload — so without a version token the browser keeps
 * serving the previously cached image (streamLogo sends Cache-Control:
 * max-age=300) and a freshly uploaded logo appears to "not update".
 *
 * The stored key embeds the upload timestamp (`org-logos/<id>-<ts>.<ext>`),
 * which changes on every replace. We surface it as a `?v=` cache-buster so the
 * URL changes exactly when — and only when — the logo actually changes. Falls
 * back to a hash of the whole path if the format ever differs.
 */
export function logoUrlFor(orgId: string, logoPath: string | null | undefined): string | null {
  if (!logoPath) return null;
  const ts = logoPath.match(/-(\d+)\.[^.]+$/)?.[1];
  let version = ts;
  if (!version) {
    let h = 0;
    for (let i = 0; i < logoPath.length; i++) h = (h * 31 + logoPath.charCodeAt(i)) | 0;
    version = String(h >>> 0);
  }
  return `/api/org/logo/${orgId}?v=${version}`;
}
