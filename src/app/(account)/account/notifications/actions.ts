'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/server/db';
import { assertUser, UnauthorizedError } from '@/server/auth/guard';

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function markNotificationReadAction(notificationId: string): Promise<ActionResult> {
  let user;
  try {
    user = await assertUser();
  } catch (err) {
    if (err instanceof UnauthorizedError) return { ok: false, error: err.message };
    throw err;
  }

  // Scoped update: a forged id belonging to another user simply matches
  // zero rows — never an error that reveals whether it exists.
  await db.notification.updateMany({
    where: { id: notificationId, userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });

  revalidatePath('/account/notifications');
  return { ok: true };
}

export async function markAllNotificationsReadAction(): Promise<ActionResult> {
  let user;
  try {
    user = await assertUser();
  } catch (err) {
    if (err instanceof UnauthorizedError) return { ok: false, error: err.message };
    throw err;
  }

  await db.notification.updateMany({
    where: { userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });

  revalidatePath('/account/notifications');
  return { ok: true };
}
