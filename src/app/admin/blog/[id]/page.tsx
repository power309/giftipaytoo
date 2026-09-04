import { notFound } from 'next/navigation';
import { requirePermission } from '@/server/auth/guard';
import { db } from '@/server/db';
import { PageHeader } from '@/components/admin/kit';
import { BlogEditorClient } from '../editor-client';

export const metadata = { title: 'ویرایش نوشته' };

export default async function EditBlogPostPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission('content.manage');
  const { id } = await params;
  const post = await db.blogPost.findUnique({ where: { id } });
  if (!post) notFound();

  return (
    <div>
      <PageHeader title={post.titleFa} />
      <BlogEditorClient initial={post} />
    </div>
  );
}
