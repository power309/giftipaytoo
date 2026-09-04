import 'server-only';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { redactCodeLike } from './guard';
import type { NotificationChannelAdapter, RenderedMessage, SendResult } from './types';

/**
 * SMS adapters.
 *
 * `logSmsProvider` is the development channel: it never talks to a real
 * gateway, just logs the (redacted) message — useful for local dev without
 * SMS credentials. `kavenegarSmsProvider` talks to Kavenegar's documented
 * REST send endpoint and, like every adapter in this codebase, is honest
 * about being unconfigured: missing `SMS_API_KEY`/`SMS_SENDER` returns
 * `{ ok:false, error:... }` rather than a fabricated success.
 *
 * `smsAdapter` is the one `service.ts` uses — it dispatches to whichever
 * provider `SMS_PROVIDER` selects.
 */

const KAVENEGAR_BASE = 'https://api.kavenegar.com/v1';

export const logSmsProvider: NotificationChannelAdapter = {
  key: 'sms-log',
  isConfigured: () => true,
  async send(msg: RenderedMessage): Promise<SendResult> {
    logger.info('notifications: [dev] sms', {
      to: msg.to,
      bodyPreview: redactCodeLike(msg.bodyText).slice(0, 300),
    });
    return { ok: true, providerId: `log:${Date.now()}` };
  },
};

export const kavenegarSmsProvider: NotificationChannelAdapter = {
  key: 'sms-kavenegar',
  isConfigured: () => env.sms.apiKey.length > 0 && env.sms.sender.length > 0,
  async send(msg: RenderedMessage): Promise<SendResult> {
    if (!this.isConfigured()) {
      logger.info('notifications: Kavenegar not configured, sms suppressed', {
        to: msg.to,
        bodyPreview: redactCodeLike(msg.bodyText).slice(0, 300),
      });
      return { ok: false, error: 'Kavenegar not configured' };
    }

    const url = new URL(`${KAVENEGAR_BASE}/${encodeURIComponent(env.sms.apiKey)}/sms/send.json`);
    url.searchParams.set('receptor', msg.to);
    url.searchParams.set('sender', env.sms.sender);
    url.searchParams.set('message', msg.bodyText);

    try {
      const res = await fetch(url.toString(), { method: 'GET' });
      const json = (await res.json().catch(() => null)) as
        | { return?: { status?: number; message?: string }; entries?: Array<{ messageid?: number | string }> }
        | null;

      const status = json?.return?.status;
      if (!res.ok || (status !== undefined && status !== 200)) {
        const message = json?.return?.message ?? `HTTP ${res.status}`;
        logger.error('notifications: Kavenegar send failed', { to: msg.to, status, message });
        return { ok: false, error: message };
      }

      const providerId = json?.entries?.[0]?.messageid ? String(json.entries[0].messageid) : undefined;
      return { ok: true, providerId };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'خطای ناشناخته ارسال پیامک';
      logger.error('notifications: Kavenegar request failed', { to: msg.to, err: message });
      return { ok: false, error: message };
    }
  },
};

function selectProvider(): NotificationChannelAdapter {
  return env.sms.provider === 'kavenegar' ? kavenegarSmsProvider : logSmsProvider;
}

export const smsAdapter: NotificationChannelAdapter = {
  key: 'sms',
  isConfigured: () => selectProvider().isConfigured(),
  send: (msg: RenderedMessage) => selectProvider().send(msg),
};
