import { db } from '@/server/db';
import { requirePermission } from '@/server/auth/guard';
import { PageHeader } from '@/components/admin/kit';
import { GroupsClient, type GroupRow } from './client';

export const metadata = { title: 'گروه‌های مشتری' };

export default async function GroupsPage() {
  await requirePermission('customer.update');

  const groups = await db.customerGroup.findMany({
    orderBy: { priority: 'desc' },
    include: { _count: { select: { users: true } } },
  });

  const rows: GroupRow[] = groups.map((g) => ({
    id: g.id,
    nameFa: g.nameFa,
    description: g.description,
    discountPercent: g.discountPercent,
    isReseller: g.isReseller,
    minSpendToman: g.minSpendToman,
    priority: g.priority,
    isActive: g.isActive,
    memberCount: g._count.users,
  }));

  return (
    <div>
      <PageHeader title="گروه‌های مشتری" description="گروه‌بندی مشتریان برای اعمال تخفیف و شرایط ویژه" />
      <GroupsClient groups={rows} />
    </div>
  );
}
