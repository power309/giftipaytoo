'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { db } from '@/server/db';
import { assertUser, UnauthorizedError } from '@/server/auth/guard';
import { enforceRateLimit, RateLimitError } from '@/server/rate-limit';
import { audit } from '@/server/audit';
import { makeReference } from '@/lib/utils';
import { ticketSchema, ticketMessageSchema, firstZodMessage } from '@/lib/schemas';
import { loadSeam, seamFn } from '@/lib/server-seam';

type NotifyAdminsFn = (permission: string, payload: unknown) => Promise<unknown>;

export type TicketFormState = { ok: false; error?: string } | { ok: true };

export type Attachment = { path: string; name: string; size: number; mime: string };

function parseAttachments(raw: FormDataEntryValue | null): Attachment[] {
  if (!raw || typeof raw !== 'string') return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter(
        (a): a is Attachment =>
          a && typeof a.path === 'string' && a.path.startsWith('/uploads/tickets/') && typeof a.name === 'string',
      )
      .slice(0, 3);
  } catch {
    return [];
  }
}

async function notifyStaffBestEffort(ticketNumber: string, subject: string): Promise<void> {
  const mod = await loadSeam('@/server/notifications/service', () => import('@/server/notifications/service'));
  const notifyAdmins = seamFn<Parameters<NotifyAdminsFn>, Awaited<ReturnType<NotifyAdminsFn>>>(mod, 'notifyAdmins');
  if (!notifyAdmins) return; // notifications module not ready yet — the ticket itself is still created
  await notifyAdmins('ticket.view', {
    template: 'ticket-new',
    type: 'ticket-new',
    href: `/admin/tickets/${ticketNumber}`,
    data: { ticketNumber, subject },
  });
}

export async function createTicketAction(_prev: TicketFormState, formData: FormData): Promise<TicketFormState> {
  let user;
  try {
    user = await assertUser();
  } catch (err) {
    if (err instanceof UnauthorizedError) return { ok: false, error: err.message };
    throw err;
  }

  const orderIdRaw = String(formData.get('orderId') ?? '').trim();
  const parsed = ticketSchema.safeParse({
    subject: formData.get('subject'),
    bodyFa: formData.get('bodyFa'),
    departmentId: formData.get('departmentId') || undefined,
    orderId: orderIdRaw || undefined,
    priority: formData.get('priority') || undefined,
  });
  if (!parsed.success) return { ok: false, error: firstZodMessage(parsed.error) };

  try {
    await enforceRateLimit('ticket.create', user.id);
  } catch (err) {
    if (err instanceof RateLimitError) return { ok: false, error: err.message };
    throw err;
  }

  // IDOR guard: a linked order must actually belong to this user.
  let orderId: string | null = null;
  if (parsed.data.orderId) {
    const order = await db.order.findFirst({ where: { id: parsed.data.orderId, userId: user.id }, select: { id: true } });
    if (!order) return { ok: false, error: 'سفارش انتخاب‌شده یافت نشد.' };
    orderId = order.id;
  }

  let departmentId: string | null = null;
  if (parsed.data.departmentId) {
    const dep = await db.ticketDepartment.findFirst({ where: { id: parsed.data.departmentId, isActive: true }, select: { id: true } });
    departmentId = dep?.id ?? null;
  }

  const attachments = parseAttachments(formData.get('attachments'));
  const number = makeReference('TCK');

  const ticket = await db.ticket.create({
    data: {
      number,
      userId: user.id,
      departmentId,
      orderId,
      subject: parsed.data.subject,
      priority: parsed.data.priority,
      status: 'OPEN',
      messages: {
        create: {
          authorId: user.id,
          isStaff: false,
          bodyFa: parsed.data.bodyFa,
          attachments: attachments.length ? attachments : undefined,
        },
      },
    },
    select: { id: true, number: true },
  });

  await audit({
    action: 'ticket.create',
    entity: 'Ticket',
    entityId: ticket.id,
    actorId: user.id,
    actorType: 'USER',
    summary: parsed.data.subject,
  });

  await notifyStaffBestEffort(ticket.number, parsed.data.subject);

  redirect(`/account/tickets/${ticket.number}`);
}

export async function replyTicketAction(_prev: TicketFormState, formData: FormData): Promise<TicketFormState> {
  let user;
  try {
    user = await assertUser();
  } catch (err) {
    if (err instanceof UnauthorizedError) return { ok: false, error: err.message };
    throw err;
  }

  const number = String(formData.get('number') ?? '');
  const ticket = await db.ticket.findFirst({ where: { number, userId: user.id }, select: { id: true, status: true } });
  if (!ticket) return { ok: false, error: 'تیکت یافت نشد.' };
  if (ticket.status === 'CLOSED') return { ok: false, error: 'این تیکت بسته شده است. برای ادامه، آن را دوباره باز کنید.' };

  const parsed = ticketMessageSchema.safeParse({ ticketId: ticket.id, bodyFa: formData.get('bodyFa') });
  if (!parsed.success) return { ok: false, error: firstZodMessage(parsed.error) };

  try {
    await enforceRateLimit('api.generic', user.id);
  } catch (err) {
    if (err instanceof RateLimitError) return { ok: false, error: err.message };
    throw err;
  }

  const attachments = parseAttachments(formData.get('attachments'));

  await db.$transaction([
    db.ticketMessage.create({
      data: {
        ticketId: ticket.id,
        authorId: user.id,
        isStaff: false,
        bodyFa: parsed.data.bodyFa,
        attachments: attachments.length ? attachments : undefined,
      },
    }),
    db.ticket.update({
      where: { id: ticket.id },
      data: { lastReplyAt: new Date(), status: ticket.status === 'PENDING_CUSTOMER' ? 'PENDING_STAFF' : ticket.status },
    }),
  ]);

  revalidatePath(`/account/tickets/${number}`);
  return { ok: true };
}

export async function reopenTicketAction(number: string): Promise<TicketFormState> {
  let user;
  try {
    user = await assertUser();
  } catch (err) {
    if (err instanceof UnauthorizedError) return { ok: false, error: err.message };
    throw err;
  }

  const ticket = await db.ticket.findFirst({ where: { number, userId: user.id }, select: { id: true } });
  if (!ticket) return { ok: false, error: 'تیکت یافت نشد.' };

  await db.ticket.update({ where: { id: ticket.id }, data: { status: 'OPEN', closedAt: null, lastReplyAt: new Date() } });
  await audit({ action: 'ticket.reopen', entity: 'Ticket', entityId: ticket.id, actorId: user.id, actorType: 'USER' });

  revalidatePath(`/account/tickets/${number}`);
  return { ok: true };
}

export async function listDepartments(): Promise<{ id: string; nameFa: string }[]> {
  return db.ticketDepartment.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
    select: { id: true, nameFa: true },
  });
}
