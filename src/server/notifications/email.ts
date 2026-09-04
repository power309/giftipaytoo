import 'server-only';
import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { redactCodeLike } from './guard';
import type { NotificationChannelAdapter, RenderedMessage, SendResult } from './types';

/**
 * SMTP email adapter (nodemailer).
 *
 * When SMTP is not configured (`SMTP_HOST` unset), this adapter does NOT
 * pretend to send: it logs the attempt at `info` level with the body
 * redacted of anything code-shaped, and returns
 * `{ ok:false, error:'SMTP not configured' }`. `service.ts` records the
 * resulting `Notification` row as SUPPRESSED, never SENT — per repo
 * convention, no integration is allowed to fabricate success.
 */

const BRAND = { violet: '#5b3df5', mint: '#00b192', ink: '#0b0d14' };

let cachedTransport: Transporter | null = null;

function getTransport(): Transporter {
  if (!cachedTransport) {
    cachedTransport = nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.secure,
      auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.password } : undefined,
    });
  }
  return cachedTransport;
}

/**
 * Wraps escaped inner HTML (already produced by `render.ts`) in a small
 * branded, inline-styled RTL document. No external images/fonts/scripts —
 * everything email clients need is inlined so the message renders
 * consistently regardless of remote-content blocking.
 */
export function wrapBrandedHtml(subject: string, innerHtml: string): string {
  return `<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8" />
<title>${subject}</title>
<style>
  body { margin:0; padding:0; background:#f4f4f7; font-family: Tahoma, 'Vazirmatn', 'Segoe UI', sans-serif; color:${BRAND.ink}; }
  .gp-wrap { max-width:560px; margin:0 auto; padding:32px 20px; }
  .gp-card { background:#ffffff; border-radius:16px; padding:32px; border:1px solid #eceef3; }
  .gp-brand { font-size:20px; font-weight:700; color:${BRAND.violet}; margin:0 0 24px; }
  .gp-brand span { color:${BRAND.mint}; }
  .gp-card p { line-height:1.9; font-size:14px; margin:0 0 14px; color:${BRAND.ink}; }
  .gp-footer { text-align:center; font-size:12px; color:#8b8fa3; margin-top:24px; }
</style>
</head>
<body>
  <div class="gp-wrap">
    <div class="gp-card">
      <p class="gp-brand">گیفتی<span>‌پی</span></p>
      ${innerHtml}
    </div>
    <div class="gp-footer">این ایمیل به‌صورت خودکار از گیفتی‌پی ارسال شده است.</div>
  </div>
</body>
</html>`;
}

async function send(msg: RenderedMessage): Promise<SendResult> {
  if (!env.smtp.configured) {
    logger.info('notifications: SMTP not configured, email suppressed', {
      to: msg.to,
      subject: msg.subject,
      bodyPreview: redactCodeLike(msg.bodyText).slice(0, 300),
    });
    return { ok: false, error: 'SMTP not configured' };
  }

  const subject = msg.subject ?? 'اعلان گیفتی‌پی';
  try {
    const info = await getTransport().sendMail({
      from: env.smtp.from,
      to: msg.to,
      subject,
      text: msg.bodyText,
      html: msg.bodyHtml ? wrapBrandedHtml(subject, msg.bodyHtml) : undefined,
    });
    return { ok: true, providerId: info.messageId };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'خطای ناشناخته ارسال ایمیل';
    logger.error('notifications: SMTP send failed', { to: msg.to, err: message });
    return { ok: false, error: message };
  }
}

export const emailAdapter: NotificationChannelAdapter = {
  key: 'email',
  isConfigured: () => env.smtp.configured,
  send,
};
