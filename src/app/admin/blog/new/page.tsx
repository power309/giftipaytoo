import { requirePermission } from '@/server/auth/guard';
import { PageHeader } from '@/components/admin/kit';
import { BlogEditorClient } from '../editor-client';

export const metadata = { title: 'نوشته جدید' };

export default async function NewBlogPostPage() {
  await requirePermission('content.manage');
  return (
    <div>
      <PageHeader title="نوشته جدید" />
      <BlogEditorClient initial={null} />
    </div>
  );
}
