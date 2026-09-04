// Intentionally NOT 'server-only': imported by the export route and the list
// page, and holds only pure filter-building logic (types + a Prisma
// where-clause builder), never a live database call.

import type { Prisma } from '@prisma/client';
import type { SearchParams } from '@/lib/admin-query';
import { dateRangeFromQuery, str } from '@/lib/admin-query';

export function buildAuditWhere(sp: SearchParams): Prisma.AuditLogWhereInput {
  const actorId = str(sp, 'actorId');
  const action = str(sp, 'action');
  const entity = str(sp, 'entity');
  const q = str(sp, 'q');
  const range = dateRangeFromQuery(sp);

  const where: Prisma.AuditLogWhereInput = {};
  if (actorId) where.actorId = actorId;
  if (action) where.action = action;
  if (entity) where.entity = entity;
  if (range.gte || range.lte) where.createdAt = { gte: range.gte, lte: range.lte };
  if (q) {
    where.OR = [
      { action: { contains: q, mode: 'insensitive' } },
      { entity: { contains: q, mode: 'insensitive' } },
      { entityId: { contains: q, mode: 'insensitive' } },
      { summary: { contains: q, mode: 'insensitive' } },
    ];
  }
  return where;
}
