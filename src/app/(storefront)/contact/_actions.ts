'use server';

import { z } from 'zod';
import { db } from '@/server/db';
import { getSessionUser, clientIp } from '@/server/auth/session';
import { enforceRateLimit, RateLimitError } from '@/server/rate-limit';
import { audit } from '@/server/audit';
import { makeReference } from '@/lib/utils';

const schema = z
  .object({
    name: z.string().trim().min(2, 'نام باید حداقل ۲ نویسه باشد.').max(80),
    email: z.string().trim().email('ایمیل نامعتبر است.').optional().or(z.literal('')),
    phone: z.string().trim().max(20).optional().or(z.literal('')),
    subject: z.string().trim().min(3, 'موضوع را کامل‌تر بنویسید.').max(150),
    message: z.string().trim().min(10, 'متن پیام باید حداقل ۱۰ نویسه باشد.').max(3000),
  })
  .refine((v) => (v.email && v.email.length > 0) || (v.phone && v.phone.length > 0), {
    message: 'ایمیل یا شماره تماس را وارد کنید.',
    path: ['email'],
  });

export type ContactResult = { ok: boolean; error?: string; ticketNumber?: string };

/**
 * Contact form: signed-in customers get a real, trackable support ticket.
 * Guests cannot own a `Ticket` row (the schema requires a `userId`), so their
 * message is recorded as a staff-facing notification instead of a
 * fabricated ticket number — honest about what actually happened.
 */
export async function submitContactAction(formData: FormData): Promise<ContactResult> {
  const ip = await clientIp();
  try {
    await enforceRateLimit('ticket.create', ip);
  } catch (err) {
    if (err instanceof RateLimitError) return { ok: false, error: err.message };
    throw err;
  }

  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'اطلاعات فرم نامعتبر است.' };
  }
  const { name, email, phone, subject, message } = parsed.data;

  const user = await getSessionUser();

  if (user) {
    const number = makeReference('TCK');
    const ticket = await db.ticket.create({
      data: {
        number,
        userId: user.id,
        subject,
        status: 'OPEN',
        priority: 'NORMAL',
        messages: { create: { authorId: user.id, isStaff: false, bodyFa: message } },
      },
      select: { id: true, number: true },
    });
    await audit({
      action: 'ticket.create',
      entity: 'Ticket',
      entityId: ticket.id,
      actorId: user.id,
      actorType: 'USER',
      ip,
      summary: subject,
    });
    return { ok: true, ticketNumber: ticket.number };
  }

  await db.notification.create({
    data: {
      channel: 'IN_APP',
      type: 'contact.guest_message',
      title: `پیام تماس از ${name}`,
      body: message,
      payload: { name, email: email || null, phone: phone || null, subject },
      status: 'QUEUED',
    },
  });
  await audit({ action: 'contact.guest_message', entity: 'Notification', actorType: 'SYSTEM', ip, summary: subject });
  return { ok: true };
}
