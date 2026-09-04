import 'server-only';
import type { NotificationStatus } from '@prisma/client';
import { db } from '../db';

/**
 * Writes `Notification` rows for the in-app (account panel) channel.
 * There is no external delivery here — creating the row IS the delivery —
 * so this always "succeeds" unless the database write itself fails.
 */

export interface WriteInAppNotificationInput {
  userId: string;
  type: string;
  title: string;
  body: string;
  href?: string | null;
  payload?: Record<string, unknown> | null;
  status?: NotificationStatus;
}

export async function writeInAppNotification(input: WriteInAppNotificationInput) {
  return db.notification.create({
    data: {
      userId: input.userId,
      channel: 'IN_APP',
      type: input.type,
      title: input.title,
      body: input.body,
      href: input.href ?? null,
      payload: input.payload ?? undefined,
      status: input.status ?? 'SENT',
      sentAt: (input.status ?? 'SENT') === 'SENT' ? new Date() : null,
    },
  });
}
