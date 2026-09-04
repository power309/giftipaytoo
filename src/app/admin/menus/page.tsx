import { db } from '@/server/db';
import { requirePermission } from '@/server/auth/guard';
import { PageHeader } from '@/components/admin/kit';
import { MenusClient } from './client';

export const metadata = { title: 'منوها' };

export default async function MenusPage() {
  await requirePermission('content.manage');
  const items = await db.menuItem.findMany({ orderBy: { sortOrder: 'asc' } });

  return (
    <div>
      <PageHeader title="منوها" description="مدیریت منوی اصلی سایت و منوهای فوتر" />
      <MenusClient items={items} />
    </div>
  );
}
