// Intentionally NOT 'server-only': this module holds pure filter constants and
// Prisma where-clause builders (types only, no database access), and the admin
// client components import those constants to render their filter controls.

import type { Prisma } from '@prisma/client';
import type { SearchParams } from '@/lib/admin-query';
import { str } from '@/lib/admin-query';

export function buildReviewsWhere(sp: SearchParams): Prisma.ReviewWhereInput {
  const status = str(sp, 'status');
  const rating = str(sp, 'rating');
  const q = str(sp, 'q');

  const where: Prisma.ReviewWhereInput = {};
  if (status) where.status = status as Prisma.EnumReviewStatusFilter['equals'];
  if (rating) where.rating = Number(rating);
  if (q) {
    where.OR = [
      { bodyFa: { contains: q, mode: 'insensitive' } },
      { titleFa: { contains: q, mode: 'insensitive' } },
      { displayName: { contains: q, mode: 'insensitive' } },
    ];
  }
  return where;
}
