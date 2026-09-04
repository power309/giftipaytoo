import 'server-only';
import type { NotificationChannel } from '@prisma/client';
import { db } from '../db';
import { logger } from '@/lib/logger';

/**
 * Renders a `NotificationTemplate` row (looked up by `(key, channel)`) with
 * `{{token}}` substitution, falling back to a built-in default when the row
 * is missing or inactive. Interpolated values are escaped for the target
 * channel — HTML-escaped for email — so template data (which may ultimately
 * come from user-entered fields such as an order note) can never break out
 * of the surrounding markup or inject headers.
 */

export type TemplateData = Record<string, string | number | boolean | null | undefined>;

export interface RenderedTemplate {
  subject?: string;
  /** Plain-text body — always present, used as-is for SMS/IN_APP and as the plain alternative for EMAIL. */
  bodyText: string;
  /** Escaped, paragraph-wrapped inner HTML — only for EMAIL. The email adapter wraps this in the branded document chrome. */
  bodyHtml?: string;
}

// ── Escaping ─────────────────────────────────────────────────────

export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Mail headers (Subject) must never contain CR/LF — strips header-injection attempts. */
function sanitizeHeaderValue(input: string): string {
  return input.replace(/[\r\n]+/g, ' ').trim();
}

function stringifyValue(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return '';
  return String(value);
}

function substitute(
  template: string,
  data: TemplateData,
  transform: (v: string) => string,
): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, token: string) => {
    if (!(token in data)) {
      logger.warn('notifications: template references unknown token', { token });
      return '';
    }
    return transform(stringifyValue(data[token]));
  });
}

/** Plain body text as HTML paragraphs, one `<p>` per non-empty line, values already escaped by the caller. */
function textToHtmlParagraphs(text: string): string {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p>${line}</p>`)
    .join('\n');
}

// ── Built-in default templates ──────────────────────────────────
// Used whenever no active NotificationTemplate row exists for (key, channel).
// Token lists are documented per key so the admin template editor can hint them.

interface DefaultTemplate {
  subject?: string;
  body: string;
}

/**
 * key -> channel -> template.
 * NEVER add a `{{code}}`/`{{giftCode}}` token to any of these — the send
 * guard in service.ts refuses to deliver a body containing anything that
 * looks like a gift-card code, by design.
 */
const DEFAULT_TEMPLATES: Record<string, Partial<Record<NotificationChannel, DefaultTemplate>>> = {
  // tokens: customerName, orderNumber, totalToman
  'order-confirmed': {
    EMAIL: {
      subject: 'سفارش {{orderNumber}} ثبت شد',
      body:
        'سلام {{customerName}}،\nسفارش شما به شماره {{orderNumber}} با مبلغ {{totalToman}} تومان ثبت شد.\nپس از تأیید پرداخت، وضعیت سفارش برای شما ارسال خواهد شد.',
    },
    SMS: { body: 'گیفتی‌پی: سفارش {{orderNumber}} ثبت شد. مبلغ: {{totalToman}} تومان.' },
    IN_APP: { subject: 'سفارش ثبت شد', body: 'سفارش {{orderNumber}} با موفقیت ثبت شد.' },
  },
  // tokens: customerName, orderNumber
  'order-paid': {
    EMAIL: {
      subject: 'پرداخت سفارش {{orderNumber}} تأیید شد',
      body: 'سلام {{customerName}}،\nپرداخت سفارش {{orderNumber}} با موفقیت تأیید شد و در حال آماده‌سازی است.',
    },
    SMS: { body: 'گیفتی‌پی: پرداخت سفارش {{orderNumber}} تأیید شد.' },
    IN_APP: { subject: 'پرداخت تأیید شد', body: 'پرداخت سفارش {{orderNumber}} تأیید شد.' },
  },
  // tokens: customerName, orderNumber — deliberately NEVER includes the code itself.
  'order-fulfilled': {
    EMAIL: {
      subject: 'سفارش {{orderNumber}} آماده است',
      body:
        'سلام {{customerName}}،\nسفارش {{orderNumber}} آماده تحویل است. برای مشاهده کد گیفت‌کارت خود وارد حساب کاربری‌تان در گیفتی‌پی شوید.',
    },
    SMS: { body: 'گیفتی‌پی: سفارش {{orderNumber}} آماده است. برای مشاهده کد وارد حساب خود شوید.' },
    IN_APP: { subject: 'سفارش آماده است', body: 'سفارش {{orderNumber}} آماده تحویل است.' },
  },
  // tokens: otpCode, purposeFa, expiresMinutes
  'otp-code': {
    EMAIL: {
      subject: 'کد تأیید گیفتی‌پی',
      body: 'کد تأیید شما: {{otpCode}}\nاین کد تا {{expiresMinutes}} دقیقه دیگر معتبر است.',
    },
    SMS: { body: 'گیفتی‌پی: کد تأیید شما {{otpCode}} است. تا {{expiresMinutes}} دقیقه معتبر.' },
  },
  // tokens: resetUrl, expiresMinutes
  'password-reset': {
    EMAIL: {
      subject: 'بازیابی گذرواژه گیفتی‌پی',
      body:
        'برای تنظیم گذرواژه جدید روی لینک زیر کلیک کنید (تا {{expiresMinutes}} دقیقه معتبر است):\n{{resetUrl}}\nاگر این درخواست را شما نداده‌اید، این پیام را نادیده بگیرید.',
    },
    SMS: { body: 'گیفتی‌پی: لینک بازیابی گذرواژه: {{resetUrl}}' },
  },
  // tokens: firstName
  'account-welcome': {
    EMAIL: {
      subject: 'به گیفتی‌پی خوش آمدید',
      body: 'سلام {{firstName}}،\nبه گیفتی‌پی خوش آمدید! از این پس می‌توانید از فروشگاه ما خرید کنید.',
    },
    IN_APP: { subject: 'خوش آمدید', body: 'به گیفتی‌پی خوش آمدید، {{firstName}} عزیز.' },
  },
  // tokens: amountToman, balanceToman
  'wallet-credit': {
    EMAIL: {
      subject: 'کیف پول شما شارژ شد',
      body: 'مبلغ {{amountToman}} تومان به کیف پول شما اضافه شد.\nموجودی فعلی: {{balanceToman}} تومان.',
    },
    SMS: { body: 'گیفتی‌پی: {{amountToman}} تومان به کیف پول شما اضافه شد.' },
    IN_APP: { subject: 'شارژ کیف پول', body: '{{amountToman}} تومان به کیف پول شما اضافه شد.' },
  },
  // tokens: amountToman, orderNumber
  'refund-issued': {
    EMAIL: {
      subject: 'بازپرداخت سفارش {{orderNumber}}',
      body: 'مبلغ {{amountToman}} تومان بابت سفارش {{orderNumber}} بازپرداخت شد.',
    },
    SMS: { body: 'گیفتی‌پی: {{amountToman}} تومان بابت سفارش {{orderNumber}} بازپرداخت شد.' },
    IN_APP: { subject: 'بازپرداخت انجام شد', body: 'بازپرداخت سفارش {{orderNumber}} انجام شد.' },
  },
  // tokens: count, sample — internal ops alert, staff-only
  'price-stale-alert': {
    IN_APP: {
      subject: 'قیمت‌های نیازمند به‌روزرسانی',
      body: '{{count}} کالا نیاز به بازبینی قیمت دارند (نمونه: {{sample}}).',
    },
    EMAIL: {
      subject: 'هشدار قیمت‌های قدیمی',
      body: '{{count}} کالا بیش از حد مجاز به‌روزرسانی نشده‌اند.\nنمونه: {{sample}}',
    },
  },
  // tokens: count — internal ops alert, staff-only
  'inventory-drift-alert': {
    IN_APP: {
      subject: 'ناهماهنگی موجودی',
      body: '{{count}} کد رزرو شده از زمان انقضای رزرو عبور کرده و هنوز آزاد نشده‌اند.',
    },
    EMAIL: {
      subject: 'هشدار ناهماهنگی موجودی',
      body: '{{count}} کد رزرو شده از زمان انقضای رزرو عبور کرده‌اند. لطفاً بررسی کنید.',
    },
  },
  // tokens: count, sku
  'low-stock': {
    IN_APP: { subject: 'موجودی رو به اتمام', body: 'موجودی کالای {{sku}} به {{count}} عدد رسیده است.' },
    EMAIL: {
      subject: 'هشدار موجودی کم',
      body: 'موجودی کالای {{sku}} به {{count}} عدد رسیده و نیاز به تأمین مجدد دارد.',
    },
  },
  // generic fallback — tokens: message
  generic: {
    EMAIL: { subject: 'اعلان جدید', body: '{{message}}' },
    SMS: { body: '{{message}}' },
    IN_APP: { subject: 'اعلان جدید', body: '{{message}}' },
  },
};

export function getDefaultTemplate(
  key: string,
  channel: NotificationChannel,
): DefaultTemplate | undefined {
  return DEFAULT_TEMPLATES[key]?.[channel];
}

// ── Rendering ────────────────────────────────────────────────────

export async function renderTemplate(
  key: string,
  channel: NotificationChannel,
  data: TemplateData,
): Promise<RenderedTemplate> {
  let subjectRaw: string | undefined;
  let bodyRaw: string;

  try {
    const row = await db.notificationTemplate.findUnique({
      where: { key_channel: { key, channel } },
    });
    if (row && row.isActive) {
      subjectRaw = row.subject ?? undefined;
      bodyRaw = row.body;
    } else {
      const def = getDefaultTemplate(key, channel) ?? getDefaultTemplate('generic', channel);
      if (!def) throw new Error(`no default template for ${key}/${channel}`);
      subjectRaw = def.subject;
      bodyRaw = def.body;
    }
  } catch (err) {
    logger.error('notifications: template lookup failed, using generic fallback', {
      key,
      channel,
      err: err instanceof Error ? err.message : String(err),
    });
    const def = getDefaultTemplate('generic', channel);
    subjectRaw = def?.subject;
    bodyRaw = def?.body ?? '{{message}}';
  }

  const bodyText = substitute(bodyRaw, data, (v) => v).trim();
  const subject = subjectRaw
    ? sanitizeHeaderValue(substitute(subjectRaw, data, (v) => v))
    : undefined;

  const result: RenderedTemplate = { subject, bodyText };

  if (channel === 'EMAIL') {
    const escapedBody = substitute(bodyRaw, data, escapeHtml).trim();
    result.bodyHtml = textToHtmlParagraphs(escapedBody);
  }

  return result;
}
