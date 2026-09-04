import { db } from '@/server/db';
import { requirePermission } from '@/server/auth/guard';
import { PageHeader } from '@/components/admin/kit';
import { BannersClient } from './client';

export const metadata = { title: 'بنرها' };

export default async function BannersPage() {
  await requirePermission('content.manage');
  const banners = await db.banner.findMany({ orderBy: [{ position: 'asc' }, { sortOrder: 'asc' }], take: 200 });

  return (
    <div>
      <PageHeader title="بنرها" description="مدیریت بنرهای تبلیغاتی صفحات فروشگاه" />
      <BannersClient banners={banners} />
    </div>
  );
}
