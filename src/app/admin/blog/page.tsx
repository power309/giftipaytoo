import Link from 'next/link';
import { Plus } from 'lucide-react';
import { db } from '@/server/db';
import { requirePermission } from '@/server/auth/guard';
import { PageHeader, StatusPill, DemoBadge } from '@/components/admin/kit';
import { Button } from '@/components/ui';
import { DataTable, type Column } from '@/components/admin/data-table';
import { formatJalali, toPersianDigits } from '@/lib/persian';
import { parseListQuery, type SearchParams } from '@/lib/admin-query';

export const metadata = { title: 'بلاگ' };

async function loadPosts(sp: SearchParams) {
  const { page, perPage, q } = parseListQuery(sp, 20);
  const status = typeof sp.status === 'string' ? sp.status : undefined;
  const where = {
    ...(status ? { status: status as never } : {}),
    ...(q ? { titleFa: { contains: q, mode: 'insensitive' as const } } : {}),
  };
  const [rows, total] = await Promise.all([
    db.blogPost.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * perPage, take: perPage }),
    db.blogPost.count({ where }),
  ]);
  return { rows, total, page, perPage };
}

type PostRow = Awaited<ReturnType<typeof loadPosts>>['rows'][number];

export default async function BlogListPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePermission('content.manage');
  const sp = await searchParams;
  const { rows, total, page, perPage } = await loadPosts(sp);

  const columns: Column<PostRow>[] = [
    {
      key: 'titleFa',
      header: 'عنوان',
      render: (p) => (
        <span className="flex items-center gap-1.5">
          {p.titleFa}
          {p.isDemo && <DemoBadge />}
        </span>
      ),
    },
    { key: 'categoryFa', header: 'دسته', secondary: true, render: (p) => p.categoryFa ?? '—' },
    { key: 'viewCount', header: 'بازدید', align: 'center', secondary: true, render: (p) => toPersianDigits(p.viewCount) },
    { key: 'publishedAt', header: 'انتشار', secondary: true, render: (p) => <span className="text-xs text-fg-muted">{p.publishedAt ? formatJalali(p.publishedAt) : '—'}</span> },
    { key: 'status', header: 'وضعیت', render: (p) => <StatusPill status={p.status} /> },
  ];

  return (
    <div>
      <PageHeader
        title="بلاگ"
        description="مدیریت نوشته‌های وبلاگ فروشگاه"
        actions={
          <Link href="/admin/blog/new">
            <Button size="sm"><Plus className="size-4" aria-hidden />نوشته جدید</Button>
          </Link>
        }
      />
      <DataTable
        rows={rows}
        columns={columns}
        total={total}
        page={page}
        perPage={perPage}
        searchPlaceholder="جست‌وجوی عنوان…"
        rowHref={(p) => `/admin/blog/${p.id}`}
        emptyTitle="نوشته‌ای ثبت نشده است"
        filters={[
          { key: 'status', label: 'وضعیت', options: [{ value: 'DRAFT', label: 'پیش‌نویس' }, { value: 'PUBLISHED', label: 'منتشرشده' }, { value: 'ARCHIVED', label: 'بایگانی' }] },
        ]}
      />
    </div>
  );
}
