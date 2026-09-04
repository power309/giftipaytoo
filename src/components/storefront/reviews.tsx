import { Rating, Pagination, EmptyState } from '@/components/ui';
import { toPersianDigits, formatJalali } from '@/lib/persian';
import { MessageSquareText, BadgeCheck } from 'lucide-react';
import type { ReviewItem } from '@/app/(storefront)/_data';
import { ReviewForm } from './review-form';

/** Rating distribution bars (1..5). Server component — pure presentation. */
export function RatingBreakdown({
  breakdown,
  ratingAvg,
  ratingCount,
}: {
  breakdown: Record<1 | 2 | 3 | 4 | 5, number>;
  ratingAvg: number;
  ratingCount: number;
}) {
  const max = Math.max(1, ...Object.values(breakdown));
  return (
    <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
      <div className="flex shrink-0 flex-col items-center gap-1.5 sm:w-36">
        <span className="text-3xl font-extrabold text-fg tnum">{toPersianDigits((ratingAvg / 100).toFixed(1))}</span>
        <Rating value={ratingAvg / 100} showValue={false} />
        <span className="text-xs text-fg-muted tnum">از {toPersianDigits(ratingCount)} دیدگاه</span>
      </div>
      <div className="min-w-0 flex-1 space-y-1.5">
        {([5, 4, 3, 2, 1] as const).map((star) => (
          <div key={star} className="flex items-center gap-2.5 text-xs">
            <span className="w-8 shrink-0 text-fg-muted tnum">{toPersianDigits(star)} ★</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-muted">
              <div
                className="h-full rounded-full bg-gold transition-all"
                style={{ width: `${(breakdown[star] / max) * 100}%` }}
              />
            </div>
            <span className="w-6 shrink-0 text-end text-fg-faint tnum">{toPersianDigits(breakdown[star])}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ReviewList({
  reviews,
  page,
  totalPages,
  basePath,
}: {
  reviews: ReviewItem[];
  page: number;
  totalPages: number;
  basePath: string;
}) {
  if (reviews.length === 0) {
    return (
      <EmptyState
        icon={<MessageSquareText className="size-7" aria-hidden />}
        title="هنوز دیدگاهی ثبت نشده"
        description="اولین نفری باشید که درباره این محصول نظر می‌دهد."
      />
    );
  }
  return (
    <div className="space-y-4">
      <ul className="space-y-4">
        {reviews.map((r) => (
          <li key={r.id} className="rounded-xl border border-border-base p-4">
            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-fg">{r.displayName}</span>
                {r.isVerifiedPurchase && (
                  <span className="flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent">
                    <BadgeCheck className="size-3" aria-hidden /> خرید تأییدشده
                  </span>
                )}
              </div>
              <span className="text-xs text-fg-faint">{formatJalali(r.createdAt)}</span>
            </div>
            <Rating value={r.rating} showValue={false} size="sm" />
            {r.titleFa && <p className="mt-2 text-sm font-semibold text-fg">{r.titleFa}</p>}
            <p className="mt-1.5 text-sm leading-7 text-fg-muted">{r.bodyFa}</p>
            {r.adminReplyFa && (
              <div className="mt-3 rounded-lg bg-surface-muted p-3">
                <p className="mb-1 text-xs font-semibold text-fg">پاسخ گیفتی‌پی</p>
                <p className="text-xs leading-6 text-fg-muted">{r.adminReplyFa}</p>
              </div>
            )}
          </li>
        ))}
      </ul>
      {totalPages > 1 && (
        <Pagination page={page} totalPages={totalPages} hrefTemplate={`${basePath}?reviewPage={page}#reviews`} />
      )}
    </div>
  );
}

export function ReviewsSection({
  productId,
  productSlug,
  reviews,
  page,
  totalPages,
  breakdown,
  ratingAvg,
  ratingCount,
  isSignedIn,
}: {
  productId: string;
  productSlug: string;
  reviews: ReviewItem[];
  page: number;
  totalPages: number;
  breakdown: Record<1 | 2 | 3 | 4 | 5, number>;
  ratingAvg: number;
  ratingCount: number;
  isSignedIn: boolean;
}) {
  return (
    <div className="space-y-6">
      {ratingCount > 0 && <RatingBreakdown breakdown={breakdown} ratingAvg={ratingAvg} ratingCount={ratingCount} />}
      <ReviewForm productId={productId} productSlug={productSlug} isSignedIn={isSignedIn} />
      <ReviewList reviews={reviews} page={page} totalPages={totalPages} basePath={`/product/${productSlug}`} />
    </div>
  );
}
