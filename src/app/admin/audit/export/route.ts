import { NextRequest } from 'next/server';
import { db } from '@/server/db';
import { assertPermission } from '@/server/auth/guard';
import { formatJalali } from '@/lib/persian';
import { toCsv, csvResponse } from '@/lib/admin-csv';
import { buildAuditWhere } from '../_lib';

export const dynamic = 'force-dynamic';

const HEADERS = ['تاریخ', 'رویداد', 'موجودیت', 'شناسه موجودیت', 'عامل', 'نوع عامل', 'توضیح', 'IP'];

export async function GET(request: NextRequest) {
  try {
    await assertPermission('audit.view');
  } catch {
    return new Response('دسترسی مجاز نیست.', { status: 403 });
  }

  const sp = Object.fromEntries(request.nextUrl.searchParams.entries());
  const where = buildAuditWhere(sp);

  const rows = await db.auditLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 20_000,
    include: { actor: { select: { firstName: true, lastName: true, email: true } } },
  });

  const csvRows = rows.map((l) => [
    formatJalali(l.createdAt, true),
    l.action,
    l.entity,
    l.entityId ?? '',
    l.actor ? [l.actor.firstName, l.actor.lastName].filter(Boolean).join(' ') || l.actor.email || '' : l.actorType,
    l.actorType,
    l.summary ?? '',
    l.ip ?? '',
  ]);

  return csvResponse('audit-log.csv', toCsv(HEADERS, csvRows));
}
