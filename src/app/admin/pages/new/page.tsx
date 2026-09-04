import { requirePermission } from '@/server/auth/guard';
import { PageHeader } from '@/components/admin/kit';
import { PageEditorClient } from '../editor-client';

export const metadata = { title: 'صفحه جدید' };

export default async function NewPagePage() {
  await requirePermission('content.manage');
  return (
    <div>
      <PageHeader title="صفحه جدید" />
      <PageEditorClient initial={null} />
    </div>
  );
}
