'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { db } from '@/server/db';
import { assertPermission } from '@/server/auth/guard';
import { audit } from '@/server/audit';
import type { ActionResult } from '@/app/admin/orders/_lib';

function fail(error: string): ActionResult {
  return { ok: false, error };
}
function ok(message?: string): ActionResult {
  return { ok: true, message };
}
function revalidateTicket(id: string) {
  revalidatePath(`/admin/tickets/${id}`);
  revalidatePath('/admin/tickets');
}

const replySchema = z.object({
  ticketId: z.string().min(1),
  body: z.string().min(1, 'متن پیام نمی‌تواند خالی باشد.').max(5000),
  internal: z.coerce.boolean().default(false),
  attachmentUrl: z.string().max(500).optional(),
  attachmentName: z.string().max(200).optional(),
});

export async function replyToTicket(input: z.infer<typeof replySchema>): Promise<ActionResult> {
  const parsed = replySchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'ورودی نامعتبر است.');
  const staff = await assertPermission('ticket.reply');

  const ticket = await db.ticket.findUnique({ where: { id: parsed.data.ticketId }, select: { id: true, status: true, number: true } });
  if (!ticket) return fail('تیکت یافت نشد.');

  const attachments = parsed.data.attachmentUrl
    ? { internal: parsed.data.internal, files: [{ path: parsed.data.attachmentUrl, name: parsed.data.attachmentName || parsed.data.attachmentUrl }] }
    : { internal: parsed.data.internal };

  await db.$transaction([
    db.ticketMessage.create({
      data: { ticketId: ticket.id, authorId: staff.id, isStaff: true, bodyFa: parsed.data.body, attachments },
    }),
    db.ticket.update({
      where: { id: ticket.id },
      data: {
        lastReplyAt: new Date(),
        status: parsed.data.internal ? ticket.status : ticket.status === 'OPEN' || ticket.status === 'PENDING_STAFF' ? 'PENDING_CUSTOMER' : ticket.status,
      },
    }),
  ]);

  await audit({
    action: parsed.data.internal ? 'ticket.note' : 'ticket.reply',
    entity: 'Ticket',
    entityId: ticket.id,
    actorId: staff.id,
    actorType: 'STAFF',
    summary: `${parsed.data.internal ? 'یادداشت داخلی' : 'پاسخ'} برای تیکت ${ticket.number}`,
  });
  revalidateTicket(ticket.id);
  return ok(parsed.data.internal ? 'یادداشت داخلی ثبت شد.' : 'پاسخ ارسال شد.');
}

const assignSchema = z.object({ ticketId: z.string().min(1), assignedToId: z.string().nullable() });

export async function assignTicket(input: z.infer<typeof assignSchema>): Promise<ActionResult> {
  const parsed = assignSchema.safeParse(input);
  if (!parsed.success) return fail('ورودی نامعتبر است.');
  const staff = await assertPermission('ticket.assign');

  await db.ticket.update({ where: { id: parsed.data.ticketId }, data: { assignedToId: parsed.data.assignedToId } });
  await audit({ action: 'ticket.assign', entity: 'Ticket', entityId: parsed.data.ticketId, actorId: staff.id, actorType: 'STAFF', after: { assignedToId: parsed.data.assignedToId } });
  revalidateTicket(parsed.data.ticketId);
  return ok('ارجاع تیکت به‌روزرسانی شد.');
}

const metaSchema = z.object({
  ticketId: z.string().min(1),
  status: z.enum(['OPEN', 'PENDING_CUSTOMER', 'PENDING_STAFF', 'RESOLVED', 'CLOSED']).optional(),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).optional(),
  departmentId: z.string().nullable().optional(),
});

export async function updateTicketMeta(input: z.infer<typeof metaSchema>): Promise<ActionResult> {
  const parsed = metaSchema.safeParse(input);
  if (!parsed.success) return fail('ورودی نامعتبر است.');
  const staff = await assertPermission('ticket.reply');

  const ticket = await db.ticket.findUnique({ where: { id: parsed.data.ticketId } });
  if (!ticket) return fail('تیکت یافت نشد.');

  const data: { status?: typeof ticket.status; priority?: typeof ticket.priority; departmentId?: string | null; closedAt?: Date | null } = {};
  if (parsed.data.status) {
    data.status = parsed.data.status;
    data.closedAt = parsed.data.status === 'CLOSED' ? new Date() : null;
  }
  if (parsed.data.priority) data.priority = parsed.data.priority;
  if (parsed.data.departmentId !== undefined) data.departmentId = parsed.data.departmentId;

  await db.ticket.update({ where: { id: ticket.id }, data });
  await audit({ action: 'ticket.update', entity: 'Ticket', entityId: ticket.id, actorId: staff.id, actorType: 'STAFF', before: { status: ticket.status, priority: ticket.priority }, after: data });
  revalidateTicket(ticket.id);
  return ok('تیکت به‌روزرسانی شد.');
}
