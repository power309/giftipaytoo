import 'server-only';

import type { Prisma } from '@prisma/client';
import type { SearchParams } from '@/lib/admin-query';
import { str } from '@/lib/admin-query';

export function buildCustomersWhere(sp: SearchParams): Prisma.UserWhereInput {
  const q = str(sp, 'q');
  const status = str(sp, 'status');
  const groupId = str(sp, 'groupId');
  const demo = str(sp, 'demo');
  const verified = str(sp, 'verified');

  const where: Prisma.UserWhereInput = { isStaff: false };
  if (status) where.status = status as Prisma.EnumUserStatusFilter['equals'];
  if (groupId) where.customerGroupId = groupId;
  if (demo === '1') where.isDemo = true;
  if (verified === '1') where.emailVerifiedAt = { not: null };
  if (verified === '0') where.emailVerifiedAt = null;
  if (q) {
    where.OR = [
      { email: { contains: q, mode: 'insensitive' } },
      { phone: { contains: q } },
      { firstName: { contains: q, mode: 'insensitive' } },
      { lastName: { contains: q, mode: 'insensitive' } },
    ];
  }
  return where;
}

export const CUSTOMER_LIST_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  status: true,
  isDemo: true,
  walletBalance: true,
  emailVerifiedAt: true,
  phoneVerifiedAt: true,
  createdAt: true,
  customerGroup: { select: { id: true, nameFa: true } },
} satisfies Prisma.UserSelect;

export function customerName(u: { firstName: string | null; lastName: string | null; email: string | null; phone: string | null }): string {
  const name = [u.firstName, u.lastName].filter(Boolean).join(' ');
  return name || u.email || u.phone || 'کاربر';
}
