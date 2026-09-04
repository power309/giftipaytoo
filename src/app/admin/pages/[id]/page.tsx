import { notFound } from 'next/navigation';
import { requirePermission } from '@/server/auth/guard';
import { db } from '@/server/db';
import { PageHeader } from '@/components/admin/kit';
import { PageEditorClient } from '../editor-client';

export const metadata = { title: 'ویرایش صفحه' };

export default async function EditPagePage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission('content.manage');
  const { id } = await params;
  const page = await db.page.findUnique({ where: { id } });
  if (!page) notFound();

  return (
    <div>
      <PageHeader title={page.titleFa} />
      <PageEditorClient initial={page} />
    </div>
  );
}
