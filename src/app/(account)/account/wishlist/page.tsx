import type { Metadata } from 'next';
import { requireUser } from '@/server/auth/guard';
import { db } from '@/server/db';
import { PageHeading } from '@/components/account/page-heading';
import { WishlistClient, type WishlistProduct } from './wishlist-client';

export const metadata: Metadata = { title: 'علاقه‌مندی‌ها' };
export const dynamic = 'force-dynamic';

export default async function WishlistPage() {
  const user = await requireUser('/account/wishlist');

  const rows = await db.wishlistItem.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    select: {
      product: {
        select: {
          id: true,
          nameFa: true,
          slug: true,
          media: { where: { kind: 'POSTER' }, orderBy: { sortOrder: 'asc' }, take: 1, select: { path: true } },
          variants: {
            where: { isActive: true },
            orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }],
            take: 1,
            select: { id: true, salePriceToman: true, basePriceToman: true, isActive: true },
          },
        },
      },
    },
  });

  const items: WishlistProduct[] = rows.map((r) => {
    const variant = r.product.variants[0] ?? null;
    return {
      productId: r.product.id,
      nameFa: r.product.nameFa,
      slug: r.product.slug,
      posterPath: r.product.media[0]?.path ?? null,
      priceToman: variant ? (variant.salePriceToman ?? variant.basePriceToman) : null,
      defaultVariantId: variant?.id ?? null,
      inStock: !!variant,
    };
  });

  return (
    <div className="space-y-5">
      <PageHeading title="علاقه‌مندی‌ها" subtitle={`${items.length.toLocaleString('fa-IR')} محصول`} />
      <WishlistClient initial={items} />
    </div>
  );
}
