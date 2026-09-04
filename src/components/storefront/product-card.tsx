import Image from 'next/image';
import Link from 'next/link';
import { Badge, Rating } from '@/components/ui';
import { formatToman, formatTomanDigits, discountPercent } from '@/lib/money';
import { toPersianDigits } from '@/lib/persian';
import { cn } from '@/lib/utils';
import { Zap, PackageX } from 'lucide-react';

export type ProductCardData = {
  slug: string;
  nameFa: string;
  brandNameFa: string;
  posterPath: string | null;
  posterAlt: string | null;
  blurData?: string | null;
  priceToman: number | null;
  compareAtToman: number | null;
  ratingAvg: number; // x100
  ratingCount: number;
  inStock: boolean;
  isFeatured?: boolean;
  isPopular?: boolean;
  deliveryType?: string;
  regionLabel?: string | null;
  variantCount?: number;
};

const FALLBACK = '/media/placeholder.webp';

/**
 * Storefront product card. Server component — no client JS needed.
 * Kept deliberately information-dense: brand, price, saving, availability
 * and delivery speed are the four things a buyer actually decides on.
 */
export function ProductCard({
  product,
  priority = false,
  className,
}: {
  product: ProductCardData;
  priority?: boolean;
  className?: string;
}) {
  const off = discountPercent(product.compareAtToman, product.priceToman ?? 0);
  const rating = product.ratingAvg / 100;

  return (
    <article
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-2xl border border-border-base bg-surface',
        'transition-all duration-300 hover:border-primary/40 hover:shadow-[var(--shadow-lift)]',
        'focus-within:border-primary/60',
        className,
      )}
    >
      <Link
        href={`/product/${product.slug}`}
        className="relative block aspect-[4/3] overflow-hidden bg-surface-muted"
        tabIndex={-1}
        aria-hidden
      >
        <Image
          src={product.posterPath || FALLBACK}
          alt=""
          fill
          sizes="(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 22vw"
          className="object-cover transition-transform duration-500 ease-[cubic-bezier(.22,1,.36,1)] group-hover:scale-[1.04]"
          priority={priority}
          {...(product.blurData ? { placeholder: 'blur' as const, blurDataURL: product.blurData } : {})}
        />

        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2.5">
          <div className="flex flex-col gap-1.5">
            {off > 0 && (
              <Badge tone="danger" size="sm" className="shadow-sm">
                {toPersianDigits(off)}٪ تخفیف
              </Badge>
            )}
            {product.isFeatured && (
              <Badge tone="gold" size="sm" className="shadow-sm">
                ویژه
              </Badge>
            )}
          </div>
          {!product.inStock && (
            <Badge tone="neutral" size="sm" className="bg-ink-900/80 text-white shadow-sm">
              <PackageX className="size-3" aria-hidden />
              ناموجود
            </Badge>
          )}
        </div>
      </Link>

      <div className="flex flex-1 flex-col gap-2 p-3.5">
        <p className="text-[11px] font-medium text-fg-faint">{product.brandNameFa}</p>

        <h3 className="text-sm font-semibold leading-6 text-fg line-clamp-2">
          <Link
            href={`/product/${product.slug}`}
            className="after:absolute after:inset-0 focus-visible:outline-none"
          >
            {product.nameFa}
          </Link>
        </h3>

        {product.ratingCount > 0 ? (
          <Rating value={rating} count={product.ratingCount} size="sm" />
        ) : (
          <span className="text-[11px] text-fg-faint">بدون دیدگاه</span>
        )}

        <div className="mt-auto space-y-1 pt-2">
          {product.regionLabel && (
            <p className="text-[11px] text-fg-muted">ریجن: {product.regionLabel}</p>
          )}

          {product.priceToman === null ? (
            <p className="text-sm text-fg-muted">قیمت به‌زودی</p>
          ) : (
            <div className="flex items-baseline gap-2 flex-wrap">
              {product.compareAtToman && off > 0 && (
                <span className="text-xs text-fg-faint line-through tnum">
                  {formatTomanDigits(product.compareAtToman)}
                </span>
              )}
              <span className="text-base font-bold text-fg tnum">
                {formatToman(product.priceToman)}
              </span>
            </div>
          )}

          {product.variantCount && product.variantCount > 1 ? (
            <p className="text-[11px] text-fg-faint">
              از {toPersianDigits(product.variantCount)} مبلغ قابل انتخاب
            </p>
          ) : null}

          {product.inStock && product.deliveryType === 'INSTANT_CODE' && (
            <p className="flex items-center gap-1 text-[11px] font-medium text-accent">
              <Zap className="size-3" aria-hidden />
              تحویل فوری کد
            </p>
          )}
        </div>
      </div>
    </article>
  );
}

/** Horizontal scrolling rail used on the home page. */
export function ProductRail({
  products,
  className,
}: {
  products: ProductCardData[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        'no-scrollbar -mx-4 flex snap-x snap-mandatory gap-3.5 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0',
        className,
      )}
    >
      {products.map((p) => (
        <ProductCard
          key={p.slug}
          product={p}
          className="w-[calc(50%-0.5rem)] shrink-0 snap-start sm:w-56 lg:w-60"
        />
      ))}
    </div>
  );
}
