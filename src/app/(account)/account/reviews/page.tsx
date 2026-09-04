import type { Metadata } from 'next';
import { Star, MessageSquareText } from 'lucide-react';
import { requireUser } from '@/server/auth/guard';
import { db } from '@/server/db';
import { formatJalali } from '@/lib/persian';
import { Card, Badge, EmptyState, SectionHeading, Rating } from '@/components/ui';
import { reviewStatusInfo } from '@/components/account/status-labels';
import { PageHeading } from '@/components/account/page-heading';
import { PendingReviews, type PendingProduct } from './pending-reviews';

export const metadata: Metadata = { title: 'دیدگاه‌های من' };
export const dynamic = 'force-dynamic';

export default async function ReviewsPage() {
  const user = await requireUser('/account/reviews');

  const myReviews = await db.review.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      productId: true,
      rating: true,
      titleFa: true,
      bodyFa: true,
      status: true,
      adminReplyFa: true,
      createdAt: true,
      product: {
        select: { nameFa: true, slug: true, media: { where: { kind: 'POSTER' }, take: 1, select: { path: true } } },
      },
    },
  });

  const completedItems = await db.orderItem.findMany({
    where: { order: { userId: user.id, status: 'COMPLETED' } },
    select: {
      productNameFa: true,
      posterPath: true,
      variant: { select: { product: { select: { id: true } } } },
    },
  });

  const reviewedIds = new Set(myReviews.map((r) => r.productId));

  const pendingMap = new Map<string, PendingProduct>();
  for (const item of completedItems) {
    const productId = item.variant?.product?.id;
    if (!productId || reviewedIds.has(productId) || pendingMap.has(productId)) continue;
    pendingMap.set(productId, { productId, nameFa: item.productNameFa, posterPath: item.posterPath });
  }
  const pendingProducts = Array.from(pendingMap.values());

  return (
    <div className="space-y-8">
      <PageHeading title="دیدگاه‌های من" subtitle="دیدگاه‌های ثبت‌شده و محصولات در انتظار نظر شما" />

      <div>
        <SectionHeading
          title="در انتظار دیدگاه شما"
          subtitle="محصولاتی که خریده‌اید و هنوز دیدگاهی برای آن‌ها ثبت نکرده‌اید"
        />
        {pendingProducts.length === 0 ? (
          <Card className="p-0">
            <EmptyState
              icon={<Star className="size-7" aria-hidden />}
              title="فعلاً محصولی در انتظار دیدگاه ندارید"
              description="پس از تکمیل سفارش‌ها، محصولات قابل نظردهی اینجا نمایش داده می‌شود."
            />
          </Card>
        ) : (
          <PendingReviews products={pendingProducts} />
        )}
      </div>

      <div>
        <SectionHeading title="دیدگاه‌های من" subtitle={`${myReviews.length.toLocaleString('fa-IR')} دیدگاه`} />
        {myReviews.length === 0 ? (
          <Card className="p-0">
            <EmptyState
              icon={<MessageSquareText className="size-7" aria-hidden />}
              title="هنوز دیدگاهی ثبت نکرده‌اید"
            />
          </Card>
        ) : (
          <ul className="space-y-3">
            {myReviews.map((r) => {
              const info = reviewStatusInfo(r.status);
              return (
                <Card key={r.id} as="li">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-fg">{r.product.nameFa}</p>
                      <div className="mt-1 flex items-center gap-2">
                        <Rating value={r.rating} showValue={false} size="sm" />
                        <span className="text-xs text-fg-faint tnum">{formatJalali(r.createdAt)}</span>
                      </div>
                    </div>
                    <Badge tone={info.tone} size="sm">
                      {info.label}
                    </Badge>
                  </div>
                  {r.titleFa && <p className="mt-2.5 text-sm font-medium text-fg">{r.titleFa}</p>}
                  <p className="mt-1 text-sm leading-7 text-fg-muted">{r.bodyFa}</p>
                  {r.adminReplyFa && (
                    <div className="mt-3 rounded-xl bg-primary-soft p-3">
                      <p className="text-xs font-semibold text-primary">پاسخ گیفتی‌پی</p>
                      <p className="mt-1 text-sm text-fg">{r.adminReplyFa}</p>
                    </div>
                  )}
                </Card>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
