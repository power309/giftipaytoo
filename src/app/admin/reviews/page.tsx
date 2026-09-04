import { db } from '@/server/db';
import { requirePermission } from '@/server/auth/guard';
import { PageHeader, StatusPill, DemoBadge } from '@/components/admin/kit';
import { Rating } from '@/components/ui';
import { DataTable, type Column, type BulkAction } from '@/components/admin/data-table';
import { formatJalali } from '@/lib/persian';
import { parseListQuery, type SearchParams } from '@/lib/admin-query';
import { buildReviewsWhere } from './_lib';
import { runReviewBulkAction } from './actions';
import { ReviewRowActions } from './row-actions';

export const metadata = { title: 'دیدگاه‌ها' };

async function loadReviews(sp: SearchParams) {
  const { page, perPage } = parseListQuery(sp, 20);
  const where = buildReviewsWhere(sp);
  const [rows, total] = await Promise.all([
    db.review.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * perPage,
      take: perPage,
      include: { product: { select: { nameFa: true, slug: true } } },
    }),
    db.review.count({ where }),
  ]);
  return { rows, total, page, perPage };
}

type ReviewRow = Awaited<ReturnType<typeof loadReviews>>['rows'][number];

export default async function ReviewsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePermission('review.moderate');
  const sp = await searchParams;
  const { rows, total, page, perPage } = await loadReviews(sp);

  const columns: Column<ReviewRow>[] = [
    {
      key: 'product',
      header: 'محصول',
      render: (r) => (
        <span className="flex items-center gap-1.5">
          {r.product.nameFa}
          {r.isDemo && <DemoBadge />}
        </span>
      ),
    },
    { key: 'rating', header: 'امتیاز', render: (r) => <Rating value={r.rating} showValue={false} size="sm" /> },
    { key: 'body', header: 'متن', render: (r) => <span className="line-clamp-2 max-w-sm text-xs text-fg-muted">{r.bodyFa}</span> },
    { key: 'displayName', header: 'نویسنده', secondary: true, render: (r) => r.displayName },
    { key: 'verified', header: 'خرید تأییدشده', secondary: true, align: 'center', render: (r) => (r.isVerifiedPurchase ? 'بله' : 'خیر') },
    { key: 'createdAt', header: 'تاریخ', secondary: true, render: (r) => <span className="text-xs text-fg-muted">{formatJalali(r.createdAt)}</span> },
    { key: 'status', header: 'وضعیت', render: (r) => <StatusPill status={r.status} /> },
    { key: 'actions', header: '', align: 'end', render: (r) => <ReviewRowActions reviewId={r.id} status={r.status} adminReply={r.adminReplyFa} /> },
  ];

  const bulkActions: BulkAction[] = [{ key: 'approve', label: 'تأیید گروهی' }];

  return (
    <div>
      <PageHeader title="دیدگاه‌های محصولات" description="بررسی و تعدیل دیدگاه‌های ثبت‌شده توسط مشتریان" />
      <DataTable
        rows={rows}
        columns={columns}
        total={total}
        page={page}
        perPage={perPage}
        searchPlaceholder="جست‌وجوی متن یا نویسنده…"
        emptyTitle="دیدگاهی یافت نشد"
        bulkActions={bulkActions}
        onBulkAction={runReviewBulkAction}
        filters={[
          {
            key: 'status',
            label: 'وضعیت',
            options: [
              { value: 'PENDING', label: 'در انتظار' },
              { value: 'APPROVED', label: 'تأییدشده' },
              { value: 'REJECTED', label: 'ردشده' },
            ],
          },
          {
            key: 'rating',
            label: 'امتیاز',
            options: [1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: `${n} ستاره` })),
          },
        ]}
      />
    </div>
  );
}
