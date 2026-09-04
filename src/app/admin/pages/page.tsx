import Link from 'next/link';
import { Plus } from 'lucide-react';
import { db } from '@/server/db';
import { requirePermission } from '@/server/auth/guard';
import { PageHeader, StatusPill } from '@/components/admin/kit';
import { Button } from '@/components/ui';
import { DataTable, type Column } from '@/components/admin/data-table';
import { formatJalali, toPersianDigits } from '@/lib/persian';
import { parseListQuery, type SearchParams } from '@/lib/admin-query';

export const metadata = { title: 'صفحات' };

async function loadPages(sp: SearchParams) {
  const { page, perPage, q } = parseListQuery(sp, 20);
  const status = typeof sp.status === 'string' ? sp.status : undefined;
  const where = {
    ...(status ? { status: status as never } : {}),
    ...(q ? { titleFa: { contains: q, mode: 'insensitive' as const } } : {}),
  };
  const [rows, total] = await Promise.all([
    db.page.findMany({ where, orderBy: { sortOrder: 'asc' }, skip: (page - 1) * perPage, take: perPage }),
    db.page.count({ where }),
  ]);
  return { rows, total, page, perPage };
}

type PageRow = Awaited<ReturnType<typeof loadPages>>['rows'][number];

export default async function PagesListPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePermission('content.manage');
  const sp = await searchParams;
  const { rows, total, page, perPage } = await loadPages(sp);

  const columns: Column<PageRow>[] = [
    { key: 'titleFa', header: 'عنوان', render: (p) => p.titleFa },
    { key: 'slug', header: 'نشانی', secondary: true, render: (p) => <span className="tnum text-fg-muted" dir="ltr">/{p.slug}</span> },
    { key: 'showInFooter', header: 'فوتر', align: 'center', secondary: true, render: (p) => (p.showInFooter ? 'بله' : 'خیر') },
    { key: 'sortOrder', header: 'ترتیب', align: 'center', secondary: true, render: (p) => toPersianDigits(p.sortOrder) },
    { key: 'updatedAt', header: 'به‌روزرسانی', secondary: true, render: (p) => <span className="text-xs text-fg-muted">{formatJalali(p.updatedAt)}</span> },
    { key: 'status', header: 'وضعیت', render: (p) => <StatusPill status={p.status} /> },
  ];

  return (
    <div>
      <PageHeader
        title="صفحات"
        description="مدیریت صفحات ثابت فروشگاه (درباره ما، قوانین و ...)"
        actions={
          <Link href="/admin/pages/new">
            <Button size="sm"><Plus className="size-4" aria-hidden />صفحه جدید</Button>
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
        rowHref={(p) => `/admin/pages/${p.id}`}
        emptyTitle="صفحه‌ای ثبت نشده است"
        filters={[
          { key: 'status', label: 'وضعیت', options: [{ value: 'DRAFT', label: 'پیش‌نویس' }, { value: 'PUBLISHED', label: 'منتشرشده' }, { value: 'ARCHIVED', label: 'بایگانی' }] },
        ]}
      />
    </div>
  );
}
