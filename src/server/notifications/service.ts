import 'server-only';
import type { NotificationChannel, Prisma } from '@prisma/client';
import { db } from '../db';
import { logger } from '@/lib/logger';
import type { PermissionKey } from '@/lib/permissions';
import { getSetting } from '../settings';
import { renderTemplate, type TemplateData } from './render';
import { findCodeLikeMatch } from './guard';
import { emailAdapter } from './email';
import { smsAdapter } from './sms';
import { writeInAppNotification } from './inapp';
import type { NotificationChannelAdapter, SendResult } from './types';

/**
 * Orchestrates a notification across channels: resolves who/where to send
 * to, renders the template per channel, dispatches through each channel's
 * adapter, and records one `Notification` row per channel with a
 * QUEUED → SENT/FAILED/SUPPRESSED status transition.
 *
 * Preference resolution: the schema has no per-user notification-preference
 * table today, so "preferences" means (a) which contact info the user
 * actually has (no email on file ⇒ no EMAIL attempt) and (b) the global
 * `notifications.emailEnabled`/`notifications.smsEnabled` settings toggles.
 * `channels` lets a caller force a specific set (e.g. a password-reset email
 * that must go out regardless of the global toggle).
 *
 * Never throws — a failing notification must not break the caller's flow
 * (an order confirmation, a payment webhook, ...).
 */

export interface NotifyInput {
  /** NotificationTemplate.key, and the fallback default template key. */
  template: string;
  userId?: string;
  email?: string | null;
  phone?: string | null;
  /** Force a specific channel set instead of the resolved default. */
  channels?: NotificationChannel[];
  data?: TemplateData;
  /** Notification.type — defaults to `template`. */
  type?: string;
  href?: string | null;
}

export interface NotifyResult {
  results: Partial<Record<NotificationChannel, SendResult & { notificationId?: string }>>;
}

function isUnconfiguredError(error: string | undefined): boolean {
  if (!error) return false;
  return /not configured/i.test(error);
}

function adapterFor(channel: NotificationChannel): NotificationChannelAdapter | null {
  if (channel === 'EMAIL') return emailAdapter;
  if (channel === 'SMS') return smsAdapter;
  return null; // IN_APP has no adapter — the DB row IS the delivery.
}

async function resolveChannels(input: NotifyInput, email: string | null, phone: string | null) {
  if (input.channels?.length) return input.channels;

  const channels: NotificationChannel[] = [];
  if (input.userId) channels.push('IN_APP');

  if (email) {
    const emailEnabled = await getSetting<boolean>('notifications.emailEnabled', true);
    if (emailEnabled) channels.push('EMAIL');
  }
  if (phone) {
    const smsEnabled = await getSetting<boolean>('notifications.smsEnabled', true);
    if (smsEnabled) channels.push('SMS');
  }
  return channels;
}

async function dispatchOne(
  channel: NotificationChannel,
  input: NotifyInput,
  target: { userId: string | null; email: string | null; phone: string | null },
): Promise<SendResult & { notificationId?: string }> {
  const data = input.data ?? {};
  const type = input.type ?? input.template;

  let rendered: Awaited<ReturnType<typeof renderTemplate>>;
  try {
    rendered = await renderTemplate(input.template, channel, data);
  } catch (err) {
    logger.error('notifications: render failed', {
      template: input.template,
      channel,
      err: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: 'template render failed' };
  }

  // Security guard: a gift-card code must never leave this layer. If the
  // rendered body looks code-shaped, the template is misconfigured — refuse
  // to send and record the failure loudly rather than delivering it.
  const leak = findCodeLikeMatch(rendered.subject) || findCodeLikeMatch(rendered.bodyText);
  if (leak) {
    logger.error('notifications: BLOCKED send — rendered body contains code-like content', {
      template: input.template,
      channel,
      type,
    });
    const row = await db.notification.create({
      data: {
        userId: target.userId,
        channel,
        type,
        title: rendered.subject ?? type,
        body: '[blocked: template produced code-like content]',
        href: input.href ?? null,
        payload: undefined,
        status: 'FAILED',
        error: 'template misconfigured: rendered body contained code-like content',
      },
    });
    return { ok: false, error: 'blocked: code-like content in rendered body', notificationId: row.id };
  }

  const title = rendered.subject ?? type;

  if (channel === 'IN_APP') {
    if (!target.userId) return { ok: false, error: 'no userId for in-app notification' };
    const row = await writeInAppNotification({
      userId: target.userId,
      type,
      title,
      body: rendered.bodyText,
      href: input.href ?? null,
      payload: (data as Record<string, unknown>) ?? null,
    });
    return { ok: true, notificationId: row.id };
  }

  const to = channel === 'EMAIL' ? target.email : target.phone;
  const adapter = adapterFor(channel);
  if (!adapter || !to) {
    return { ok: false, error: `no destination for channel ${channel}` };
  }

  const row = await db.notification.create({
    data: {
      userId: target.userId,
      channel,
      type,
      title,
      body: rendered.bodyText,
      href: input.href ?? null,
      payload: (data as Prisma.InputJsonValue) ?? undefined,
      status: 'QUEUED',
    },
  });

  let result: SendResult;
  try {
    result = await adapter.send({
      subject: rendered.subject,
      bodyText: rendered.bodyText,
      bodyHtml: rendered.bodyHtml,
      to,
    });
  } catch (err) {
    result = { ok: false, error: err instanceof Error ? err.message : 'خطای ناشناخته ارسال' };
  }

  const status = result.ok ? 'SENT' : isUnconfiguredError(result.error) ? 'SUPPRESSED' : 'FAILED';
  await db.notification.update({
    where: { id: row.id },
    data: {
      status,
      error: result.ok ? null : (result.error ?? null),
      sentAt: result.ok ? new Date() : null,
    },
  });

  return { ...result, notificationId: row.id };
}

export async function notify(input: NotifyInput): Promise<NotifyResult> {
  try {
    let email = input.email ?? null;
    let phone = input.phone ?? null;

    if (input.userId && (!email || !phone)) {
      const user = await db.user.findUnique({
        where: { id: input.userId },
        select: { email: true, phone: true },
      });
      email = email ?? user?.email ?? null;
      phone = phone ?? user?.phone ?? null;
    }

    const channels = await resolveChannels(input, email, phone);
    const target = { userId: input.userId ?? null, email, phone };

    const results: NotifyResult['results'] = {};
    for (const channel of channels) {
      results[channel] = await dispatchOne(channel, input, target);
    }
    return { results };
  } catch (err) {
    logger.error('notifications: notify() failed unexpectedly', {
      template: input.template,
      err: err instanceof Error ? err.message : String(err),
    });
    return { results: {} };
  }
}

/**
 * Fans a notification out to every staff user holding `permissionKey` —
 * used for operational alerts (low stock, manual-review orders, price
 * staleness, inventory drift). Delivers IN_APP always, plus EMAIL when the
 * staff member has one on file, subject to the same global toggle as `notify`.
 */
export async function notifyAdmins(
  permissionKey: PermissionKey,
  input: Omit<NotifyInput, 'userId' | 'email' | 'phone'>,
): Promise<void> {
  try {
    const staff = await db.user.findMany({
      where: {
        isStaff: true,
        status: 'ACTIVE',
        deletedAt: null,
        roles: { some: { role: { permissions: { some: { permission: { key: permissionKey } } } } } },
      },
      select: { id: true, email: true, phone: true },
    });

    if (staff.length === 0) {
      logger.warn('notifications: notifyAdmins found no staff with permission', { permissionKey });
      return;
    }

    await Promise.all(
      staff.map((s) =>
        notify({ ...input, userId: s.id, email: s.email, phone: s.phone }).catch((err) =>
          logger.error('notifications: notifyAdmins dispatch failed for one recipient', {
            userId: s.id,
            err: err instanceof Error ? err.message : String(err),
          }),
        ),
      ),
    );
  } catch (err) {
    logger.error('notifications: notifyAdmins failed unexpectedly', {
      permissionKey,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}
