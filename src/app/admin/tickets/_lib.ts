import 'server-only';

import type { Prisma } from '@prisma/client';
import type { SearchParams } from '@/lib/admin-query';
import { str } from '@/lib/admin-query';

export const TICKET_PRIORITY_OPTIONS = [
  { value: 'LOW', label: 'کم' },
  { value: 'NORMAL', label: 'عادی' },
  { value: 'HIGH', label: 'بالا' },
  { value: 'URGENT', label: 'فوری' },
];

export const TICKET_STATUS_OPTIONS = [
  { value: 'OPEN', label: 'باز' },
  { value: 'PENDING_CUSTOMER', label: 'در انتظار مشتری' },
  { value: 'PENDING_STAFF', label: 'در انتظار پشتیبان' },
  { value: 'RESOLVED', label: 'حل‌شده' },
  { value: 'CLOSED', label: 'بسته' },
];

/** SLA-ish age thresholds in hours, per priority, before a still-open ticket is flagged stale. */
const SLA_HOURS: Record<string, number> = { URGENT: 2, HIGH: 8, NORMAL: 24, LOW: 72 };

export function isTicketStale(priority: string, lastReplyAt: Date, status: string): boolean {
  if (status === 'RESOLVED' || status === 'CLOSED') return false;
  const hours = (Date.now() - new Date(lastReplyAt).getTime()) / 3_600_000;
  return hours > (SLA_HOURS[priority] ?? 24);
}

export function buildTicketsWhere(sp: SearchParams): Prisma.TicketWhereInput {
  const q = str(sp, 'q');
  const status = str(sp, 'status');
  const priority = str(sp, 'priority');
  const departmentId = str(sp, 'departmentId');
  const assignedToId = str(sp, 'assignedToId');

  const where: Prisma.TicketWhereInput = {};
  if (status) where.status = status as Prisma.EnumTicketStatusFilter['equals'];
  if (priority) where.priority = priority as Prisma.EnumTicketPriorityFilter['equals'];
  if (departmentId) where.departmentId = departmentId;
  if (assignedToId === 'unassigned') where.assignedToId = null;
  else if (assignedToId) where.assignedToId = assignedToId;
  if (q) {
    where.OR = [
      { number: { contains: q, mode: 'insensitive' } },
      { subject: { contains: q, mode: 'insensitive' } },
      { user: { email: { contains: q, mode: 'insensitive' } } },
      { user: { firstName: { contains: q, mode: 'insensitive' } } },
      { user: { lastName: { contains: q, mode: 'insensitive' } } },
    ];
  }
  return where;
}
