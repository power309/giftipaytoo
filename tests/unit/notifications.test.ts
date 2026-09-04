import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { db } from '@/server/db';
import { renderTemplate, escapeHtml } from '@/server/notifications/render';
import { containsCodeLikeContent, findCodeLikeMatch, redactCodeLike } from '@/server/notifications/guard';
import { emailAdapter } from '@/server/notifications/email';
import { kavenegarSmsProvider, logSmsProvider } from '@/server/notifications/sms';
import { notify } from '@/server/notifications/service';

const TEST_PREFIX = 'TEST-notif';

describe('escapeHtml', () => {
  it('escapes the five HTML-significant characters', () => {
    expect(escapeHtml(`<b>"it's" & <script>`)).toBe(
      '&lt;b&gt;&quot;it&#39;s&quot; &amp; &lt;script&gt;',
    );
  });
});

describe('renderTemplate — default templates + token substitution', () => {
  it('renders a known default template for EMAIL with escaped HTML and a plain text alternative', async () => {
    const rendered = await renderTemplate('account-welcome', 'EMAIL', {
      firstName: '<b>Sara</b>',
    });
    expect(rendered.subject).toBe('به گیفتی‌پی خوش آمدید');
    // Plain text alternative keeps the raw value.
    expect(rendered.bodyText).toContain('<b>Sara</b>');
    // HTML body must have the value escaped — never raw markup from data.
    expect(rendered.bodyHtml).toBeDefined();
    expect(rendered.bodyHtml).toContain('&lt;b&gt;Sara&lt;/b&gt;');
    expect(rendered.bodyHtml).not.toContain('<b>Sara</b>');
  });

  it('renders SMS/IN_APP without an HTML body', async () => {
    const sms = await renderTemplate('otp-code', 'SMS', { otpCode: '123456', expiresMinutes: 5 });
    expect(sms.bodyHtml).toBeUndefined();
    expect(sms.bodyText).toContain('123456');
  });

  it('falls back to the generic template for an unknown key', async () => {
    const rendered = await renderTemplate('__totally-unknown-key__', 'IN_APP', {
      message: 'سلام دنیا',
    });
    expect(rendered.bodyText).toBe('سلام دنیا');
  });

  it('leaves an unresolved token as empty text and logs (does not throw)', async () => {
    const rendered = await renderTemplate('generic', 'IN_APP', {});
    expect(rendered.bodyText).toBe('');
  });
});

describe('renderTemplate — DB-row override + header injection sanitization', () => {
  const key = `${TEST_PREFIX}-override`;

  beforeAll(async () => {
    await db.notificationTemplate.create({
      data: {
        key,
        channel: 'EMAIL',
        subject: 'سلام {{name}}',
        body: 'پیام برای {{name}}: {{note}}',
        isActive: true,
      },
    });
  });

  afterAll(async () => {
    await db.notificationTemplate.deleteMany({ where: { key } });
  });

  it('prefers an active DB template row over the built-in default', async () => {
    const rendered = await renderTemplate(key, 'EMAIL', {
      name: 'Ali',
      note: '<img src=x onerror=alert(1)>',
    });
    expect(rendered.subject).toBe('سلام Ali');
    expect(rendered.bodyHtml).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(rendered.bodyHtml).not.toContain('<img');
  });

  it('strips CR/LF from subject substitutions to prevent mail-header injection', async () => {
    const rendered = await renderTemplate(key, 'EMAIL', {
      name: 'X\r\nBcc: attacker@evil.example',
      note: 'n',
    });
    // The literal text may remain, but with no CR/LF it can never start a new
    // header — that's the actual injection vector this guards against.
    expect(rendered.subject).not.toMatch(/[\r\n]/);
  });

  it('ignores an inactive template row and falls back to default', async () => {
    await db.notificationTemplate.update({ where: { key_channel: { key, channel: 'EMAIL' } }, data: { isActive: false } });
    const rendered = await renderTemplate(key, 'EMAIL', { name: 'Ali', note: 'n' });
    // No default template registered for this made-up key -> generic fallback.
    expect(rendered.subject).toBe('اعلان جدید');
    await db.notificationTemplate.update({ where: { key_channel: { key, channel: 'EMAIL' } }, data: { isActive: true } });
  });
});

describe('code-leak guard', () => {
  it('detects a dash-grouped gift-card-code-shaped string', () => {
    expect(containsCodeLikeContent('کد شما: XSTP-9F2K-4821 است')).toBe(true);
  });

  it('detects a long mixed alphanumeric token', () => {
    expect(containsCodeLikeContent('code: AB12CD34EF56GH78')).toBe(true);
  });

  it('does not flag ordinary Persian prose or short numbers', () => {
    expect(containsCodeLikeContent('سفارش شما با موفقیت ثبت شد. مبلغ ۱۲۵۰۰۰ تومان.')).toBe(false);
    expect(containsCodeLikeContent('کد تأیید شما 482913 است.')).toBe(false); // 6-digit OTP, not a gift-card code
  });

  it('does not flag an order number like GP-260904-8F3K2', () => {
    expect(containsCodeLikeContent('سفارش GP-260904-8F3K2 ثبت شد')).toBe(false);
  });

  it('redacts matches for safe logging without throwing', () => {
    const redacted = redactCodeLike('کد شما XSTP-9F2K-4821 است');
    expect(redacted).not.toContain('XSTP-9F2K-4821');
    expect(redacted).toContain('[redacted]');
  });

  it('findCodeLikeMatch returns null for clean text', () => {
    expect(findCodeLikeMatch('متن تمیز بدون کد')).toBeNull();
  });
});

describe('adapters are honest about being unconfigured', () => {
  it('email adapter refuses to send when SMTP is not configured, and does not throw', async () => {
    expect(emailAdapter.isConfigured()).toBe(false); // SMTP_HOST is empty in the test env
    const result = await emailAdapter.send({
      to: 'someone@example.com',
      subject: 'test',
      bodyText: 'hello',
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not configured/i);
  });

  it('kavenegar sms provider refuses to send without an API key, and does not throw', async () => {
    const prevProvider = process.env.SMS_PROVIDER;
    const prevKey = process.env.SMS_API_KEY;
    process.env.SMS_PROVIDER = 'kavenegar';
    process.env.SMS_API_KEY = '';
    try {
      expect(kavenegarSmsProvider.isConfigured()).toBe(false);
      const result = await kavenegarSmsProvider.send({ to: '09120000000', bodyText: 'hello' });
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/not configured/i);
    } finally {
      process.env.SMS_PROVIDER = prevProvider;
      process.env.SMS_API_KEY = prevKey;
    }
  });

  it('the dev log sms provider is always "configured" and never fakes a real delivery beyond logging', async () => {
    expect(logSmsProvider.isConfigured()).toBe(true);
    const result = await logSmsProvider.send({ to: '09120000000', bodyText: 'hello world' });
    expect(result.ok).toBe(true);
    expect(result.providerId).toMatch(/^log:/);
  });
});

describe('service.notify — end-to-end guard against sending a template with code-like content', () => {
  const key = `${TEST_PREFIX}-leaky`;
  let userId: string;

  beforeAll(async () => {
    await db.notificationTemplate.create({
      data: {
        key,
        channel: 'IN_APP',
        subject: 'کد شما',
        // Deliberately misconfigured template — must never be allowed to send.
        body: 'کد گیفت‌کارت شما: XSTP-9F2K-4821',
        isActive: true,
      },
    });
    const user = await db.user.create({
      data: {
        email: `${TEST_PREFIX.toLowerCase()}-user@example.invalid`,
        status: 'ACTIVE',
        isDemo: true,
      },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await db.notification.deleteMany({ where: { userId } });
    await db.user.deleteMany({ where: { id: userId } });
    await db.notificationTemplate.deleteMany({ where: { key } });
  });

  it('blocks the send and records a FAILED notification instead of delivering the code', async () => {
    const { results } = await notify({ template: key, userId, channels: ['IN_APP'] });
    expect(results.IN_APP?.ok).toBe(false);
    expect(results.IN_APP?.error).toMatch(/code-like/i);

    const row = await db.notification.findFirst({ where: { userId, type: key } });
    expect(row).toBeTruthy();
    expect(row?.status).toBe('FAILED');
    expect(row?.body).not.toContain('XSTP-9F2K-4821');
  });
});
