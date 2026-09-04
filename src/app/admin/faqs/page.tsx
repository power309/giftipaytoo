import { db } from '@/server/db';
import { requirePermission } from '@/server/auth/guard';
import { PageHeader } from '@/components/admin/kit';
import { FaqsClient } from './client';

export const metadata = { title: 'سؤالات متداول' };

export default async function FaqsPage() {
  await requirePermission('content.manage');

  const [faqs, categories] = await Promise.all([
    db.faq.findMany({ orderBy: [{ group: 'asc' }, { sortOrder: 'asc' }], include: { category: { select: { nameFa: true } } }, take: 300 }),
    db.category.findMany({ select: { id: true, nameFa: true }, orderBy: { nameFa: 'asc' }, take: 300 }),
  ]);

  return (
    <div>
      <PageHeader title="سؤالات متداول" description="مدیریت پرسش‌های پرتکرار فروشگاه و محصولات" />
      <FaqsClient faqs={faqs} categories={categories} />
    </div>
  );
}
