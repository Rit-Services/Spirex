// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import nodemailer, { type Transporter } from 'nodemailer';
import { config, isMailerConfigured } from '../../config/index.js';
import { BRAND } from '../../config/brand.js';
import logger from '../../utils/logger.js';

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (!isMailerConfigured()) return null;
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: config.smtp.user
      ? { user: config.smtp.user, pass: config.smtp.password }
      : undefined,
  });
  return transporter;
}

export interface MailAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
  cid?: string;
}

export interface SendMailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: MailAttachment[];
}

// ── Brand chrome (shared header + e-signature) ──────────────────────────────
// Every transactional email is wrapped in `emailShell`, so the logo header and
// SPIREX signature are defined ONCE here, not copy-pasted into each template.
// NOTE: this is the in-email branding. The sender AVATAR shown next to the
// address in the inbox is NOT set here — that needs BIMI (DNS TXT + DMARC + a
// Verified Mark Certificate), which is mail-infrastructure, not app code.

const ACCENT = BRAND.accent;
const FONT = '-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif';

/**
 * The brand "display picture": a hosted logo if `BRAND.logoUrl` is set,
 * otherwise a CSS monogram badge that renders reliably in every mail client
 * (no remote image needed, immune to image-blocking and SVG-stripping).
 */
function brandMark(px: number): string {
  const radius = Math.round(px / 4);
  if (BRAND.logoUrl) {
    return `<img src="${BRAND.logoUrl}" width="${px}" height="${px}" alt="${BRAND.name}"
              style="display:block;width:${px}px;height:${px}px;border-radius:${radius}px;object-fit:cover" />`;
  }
  const fontSize = Math.round(px * 0.36);
  return `<div style="width:${px}px;height:${px}px;border-radius:${radius}px;
            background:linear-gradient(135deg,${ACCENT},#6d5efc);color:#ffffff;font-weight:800;
            font-size:${fontSize}px;line-height:${px}px;text-align:center;font-family:${FONT}">${BRAND.monogram}</div>`;
}

/** Top header — logo badge + two-tone SPIR·EX wordmark. */
function emailHeader(): string {
  return `
    <div style="padding:20px 24px;border-bottom:1px solid #eef2f7">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse">
        <tr>
          <td style="vertical-align:middle">${brandMark(40)}</td>
          <td style="vertical-align:middle;padding-left:12px">
            <span style="font-size:18px;font-weight:800;letter-spacing:.3px;color:#0f172a">${BRAND.nameLead}</span><span style="font-size:18px;font-weight:800;letter-spacing:.3px;color:${ACCENT}">${BRAND.nameAccent}</span>
          </td>
        </tr>
      </table>
    </div>`;
}

/** Footer — the per-email "why you got this" note plus the SPIREX e-signature. */
function emailSignature(footerNote: string): string {
  const appUrl = config.clientUrl;
  const stripScheme = (u: string) => u.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const prettyUrl = stripScheme(appUrl);
  const prettyCompanyUrl = stripScheme(BRAND.companyUrl);
  const prettyCloudUrl = stripScheme(BRAND.cloudUrl);
  return `
    <div style="padding:18px 24px;border-top:1px solid #eef2f7;background:#f8fafc">
      ${
        footerNote
          ? `<p style="margin:0 0 14px;font-size:12px;color:#64748b;line-height:1.5">${footerNote}</p>`
          : ''
      }
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse">
        <tr>
          <td style="vertical-align:top">${brandMark(36)}</td>
          <td style="vertical-align:top;padding-left:12px">
            <div style="font-size:13px;font-weight:700;color:#0f172a">The ${BRAND.name} Team</div>
            <div style="font-size:12px;color:#64748b">${BRAND.tagline}</div>
            <a href="${appUrl}" style="font-size:12px;color:${ACCENT};text-decoration:none">${prettyUrl}</a>
          </td>
        </tr>
      </table>
      <div style="margin-top:14px;padding-top:14px;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8;line-height:1.7">
        ${BRAND.name} is an open-source project by
        <a href="${BRAND.companyUrl}" style="color:${ACCENT};text-decoration:none">${BRAND.company}</a>
        · <a href="${BRAND.companyUrl}" style="color:${ACCENT};text-decoration:none">${prettyCompanyUrl}</a><br />
        Something wrong or a question? Reach us at
        <a href="mailto:${BRAND.contactEmail}" style="color:${ACCENT};text-decoration:none">${BRAND.contactEmail}</a>${
          BRAND.cloudUrl
            ? `<br />Don't want to self-host? Try the free hosted version at
        <a href="${BRAND.cloudUrl}" style="color:${ACCENT};text-decoration:none">${prettyCloudUrl}</a>`
            : ''
        }
      </div>
    </div>`;
}

/**
 * Wrap a template's body in the branded card: logo header on top, signature at
 * the bottom. `inner` is the unique message content; `footerNote` is the small
 * "you're receiving this because…" line that now lives above the signature.
 */
function emailShell(inner: string, footerNote: string): string {
  return `
    <div style="background:#f1f5f9;padding:24px 12px;font-family:${FONT}">
      <div style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden">
        ${emailHeader()}
        <div style="padding:24px;color:#0f172a">
          ${inner}
        </div>
        ${emailSignature(footerNote)}
      </div>
    </div>`.trim();
}

/** Shared primary CTA button + "or paste this link" fallback. */
function ctaBlock(url: string, label: string): string {
  return `
    <p style="margin:24px 0">
      <a href="${url}"
         style="display:inline-block;background:${ACCENT};color:#fff;text-decoration:none;
                padding:12px 22px;border-radius:8px;font-weight:600">
        ${label}
      </a>
    </p>
    <p style="margin:0 0 8px;font-size:13px;color:#475569">
      Or copy and paste this link into your browser:
    </p>
    <p style="margin:0 0 4px;font-size:13px;word-break:break-all">
      <a href="${url}" style="color:${ACCENT}">${url}</a>
    </p>`;
}

export const mailer = {
  async send({ to, subject, html, text, attachments }: SendMailOptions): Promise<{ sent: boolean; reason?: string }> {
    const tx = getTransporter();
    if (!tx) {
      logger.warn(`mailer: SMTP not configured — skipping send to ${to} (${subject})`);
      return { sent: false, reason: 'smtp_not_configured' };
    }
    try {
      const info = await tx.sendMail({
        from: config.smtp.from,
        to,
        subject,
        html,
        text: text ?? html.replace(/<[^>]+>/g, ''),
        attachments,
      });
      logger.info(`mailer: sent "${subject}" to ${to} (id=${info.messageId})`);
      return { sent: true };
    } catch (err) {
      logger.error('mailer: send failed', err);
      return { sent: false, reason: 'send_failed' };
    }
  },

  async sendInvite(opts: { to: string; name: string; inviteUrl: string; expiresAt: Date }) {
    const expires = opts.expiresAt.toUTCString();
    const inner = `
      <h2 style="margin:0 0 16px;font-size:20px">You've been invited to ${BRAND.name}</h2>
      <p style="margin:0 0 12px;line-height:1.55">
        Hi ${escapeHtml(opts.name)}, an admin has invited you to join the ${BRAND.name} workspace.
        Click the button below to set your password and sign in.
      </p>
      ${ctaBlock(opts.inviteUrl, 'Accept invite &amp; set password')}
    `;
    return this.send({
      to: opts.to,
      subject: `You are invited to ${BRAND.name}`,
      html: emailShell(
        inner,
        `This invite expires on ${expires}. If it wasn't expected, you can ignore this email.`,
      ),
    });
  },

  async sendMention(opts: {
    to: string;
    recipientName: string;
    actorName: string;
    storyKey: string;
    storyTitle: string;
    storyUrl: string;
  }) {
    const inner = `
      <h2 style="margin:0 0 16px;font-size:20px">You were mentioned in a comment</h2>
      <p style="margin:0 0 12px;line-height:1.55">
        Hi ${escapeHtml(opts.recipientName)}, <strong>${escapeHtml(opts.actorName)}</strong>
        mentioned you in a comment on
        <strong>${escapeHtml(opts.storyKey)} — ${escapeHtml(opts.storyTitle)}</strong>.
      </p>
      ${ctaBlock(opts.storyUrl, 'Open the comment')}
    `;
    return this.send({
      to: opts.to,
      subject: `${opts.actorName} mentioned you on ${opts.storyKey}`,
      html: emailShell(
        inner,
        `You're receiving this because you were @-mentioned in ${BRAND.name}.`,
      ),
    });
  },

  /**
   * Generic story-update email — the email channel for every watcher
   * notification (status / priority / assignment / reporter / comment / edit).
   * `headline` is a third-person verb phrase, e.g. "moved this story to QA".
   */
  async sendStoryUpdate(opts: {
    to: string;
    recipientName: string;
    actorName: string;
    storyKey: string;
    storyTitle: string;
    storyUrl: string;
    headline: string;
    /** Plain-text comment, rendered as a quote (comment / @-mention emails). */
    commentExcerpt?: string;
  }) {
    // Quote the comment so the recipient reads it inline. Cap the length so a
    // wall-of-text comment doesn't bloat the email; the link opens the full one.
    const trimmed = opts.commentExcerpt?.trim();
    const commentBlock = trimmed
      ? `<blockquote style="margin:0 0 4px;padding:12px 16px;border-left:3px solid ${ACCENT};background:#f1f5f9;border-radius:6px;color:#334155;font-size:14px;line-height:1.55;white-space:pre-wrap">${escapeHtml(
          trimmed.length > 600 ? `${trimmed.slice(0, 600).trimEnd()}…` : trimmed,
        )}</blockquote>`
      : '';
    const inner = `
      <h2 style="margin:0 0 16px;font-size:20px">Update on ${escapeHtml(opts.storyKey)}</h2>
      <p style="margin:0 0 12px;line-height:1.55">
        Hi ${escapeHtml(opts.recipientName)}, <strong>${escapeHtml(opts.actorName)}</strong>
        ${escapeHtml(opts.headline)} on
        <strong>${escapeHtml(opts.storyKey)} — ${escapeHtml(opts.storyTitle)}</strong>.
      </p>
      ${commentBlock}
      ${ctaBlock(opts.storyUrl, 'Open the issue')}
    `;
    return this.send({
      to: opts.to,
      subject: `${opts.storyKey}: ${opts.actorName} ${opts.headline}`,
      html: emailShell(
        inner,
        `You're receiving this because you watch this issue. Manage notifications in your ${BRAND.name} profile settings.`,
      ),
    });
  },

  /**
   * Sprint-completion email (Phase 14). Sent to project members who opted into
   * `sprint_completed` in Project Settings. A sprint isn't a story, so this has
   * its own template (no story key/title) and links to the board.
   */
  async sendSprintCompleted(opts: {
    to: string;
    recipientName: string;
    actorName: string;
    sprintName: string;
    boardUrl: string;
  }) {
    const inner = `
      <h2 style="margin:0 0 16px;font-size:20px">Sprint completed</h2>
      <p style="margin:0 0 12px;line-height:1.55">
        Hi ${escapeHtml(opts.recipientName)}, <strong>${escapeHtml(opts.actorName)}</strong>
        completed the sprint <strong>${escapeHtml(opts.sprintName)}</strong>.
      </p>
      ${ctaBlock(opts.boardUrl, 'Open the board')}
    `;
    return this.send({
      to: opts.to,
      subject: `Sprint completed: ${opts.sprintName}`,
      html: emailShell(
        inner,
        `You're receiving this because sprint-completion email is on for you in this project's settings. A project lead or you can change it there.`,
      ),
    });
  },

  /**
   * Weekly digest email — a per-project activity rollup plus the recipient's
   * own open issues. Sent by digestService, fired by the k8s CronJob.
   */
  async sendWeeklyDigest(opts: {
    to: string;
    name: string;
    projects: {
      key: string;
      name: string;
      createdThisWeek: number;
      completedThisWeek: number;
      inProgressNow: number;
    }[];
    tickets: { key: string; title: string; status: string; role: string; projectId: string }[];
  }) {
    const projectRows =
      opts.projects.length > 0
        ? opts.projects
            .map(
              (p) => `
        <tr>
          <td style="padding:8px 10px;border-top:1px solid #e2e8f0">
            <strong>${escapeHtml(p.key)}</strong> · ${escapeHtml(p.name)}
          </td>
          <td style="padding:8px 10px;border-top:1px solid #e2e8f0;text-align:center">${p.createdThisWeek}</td>
          <td style="padding:8px 10px;border-top:1px solid #e2e8f0;text-align:center">${p.completedThisWeek}</td>
          <td style="padding:8px 10px;border-top:1px solid #e2e8f0;text-align:center">${p.inProgressNow}</td>
        </tr>`,
            )
            .join('')
        : `<tr><td colspan="4" style="padding:10px;color:#64748b;border-top:1px solid #e2e8f0">
             You're not a member of any project yet.
           </td></tr>`;

    const ticketItems =
      opts.tickets.length > 0
        ? opts.tickets
            .map((t) => {
              // Full-page issue route — the root `/?story=` link bounced
              // through RoleLanding, which drops the query string.
              const url = `${config.clientUrl}/projects/${t.projectId}/stories/${encodeURIComponent(t.key)}`;
              return `
        <li style="margin:0 0 8px;line-height:1.5">
          <a href="${url}" style="color:${ACCENT};font-weight:600;text-decoration:none">${escapeHtml(t.key)}</a>
          — ${escapeHtml(t.title)}
          <span style="color:#64748b">· ${escapeHtml(t.status)} · ${escapeHtml(t.role)}</span>
        </li>`;
            })
            .join('')
        : `<li style="color:#64748b">No open issues assigned to or reported by you.</li>`;

    const inner = `
      <h2 style="margin:0 0 4px;font-size:20px">Your week in ${BRAND.name}</h2>
      <p style="margin:0 0 20px;color:#64748b;font-size:13px">
        Hi ${escapeHtml(opts.name)}, here's what happened over the last 7 days.
      </p>

      <h3 style="margin:0 0 8px;font-size:14px">Project activity</h3>
      <table style="width:100%;border-collapse:collapse;font-size:13px;margin:0 0 24px">
        <thead>
          <tr style="color:#64748b;text-align:left">
            <th style="padding:6px 10px">Project</th>
            <th style="padding:6px 10px;text-align:center">Created</th>
            <th style="padding:6px 10px;text-align:center">Completed</th>
            <th style="padding:6px 10px;text-align:center">In progress</th>
          </tr>
        </thead>
        <tbody>${projectRows}</tbody>
      </table>

      <h3 style="margin:0 0 8px;font-size:14px">Your open issues</h3>
      <ul style="margin:0;padding-left:18px;font-size:13px">${ticketItems}</ul>
    `;

    return this.send({
      to: opts.to,
      subject: `Your ${BRAND.name} weekly digest`,
      html: emailShell(
        inner,
        `You receive this weekly summary because the digest is on in your ${BRAND.name} notification settings. Turn it off there anytime.`,
      ),
    });
  },

  async sendPasswordReset(opts: { to: string; name: string; resetUrl: string; expiresAt: Date }) {
    const expires = opts.expiresAt.toUTCString();
    const inner = `
      <h2 style="margin:0 0 16px;font-size:20px">Reset your ${BRAND.name} password</h2>
      <p style="margin:0 0 12px;line-height:1.55">
        Hi ${escapeHtml(opts.name)}, an admin has triggered a password reset for your ${BRAND.name} account.
        Click the button below to choose a new password.
      </p>
      ${ctaBlock(opts.resetUrl, 'Reset password')}
    `;
    return this.send({
      to: opts.to,
      subject: `Reset your ${BRAND.name} password`,
      html: emailShell(
        inner,
        `This link expires on ${expires}. If you didn't expect this, contact your admin — your current password remains valid until the link is used.`,
      ),
    });
  },
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
