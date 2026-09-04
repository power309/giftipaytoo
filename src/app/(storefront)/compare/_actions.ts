'use server';

import { getProductBySlug, deliveryLabel } from '../_data';

export type CompareRow = {
  slug: string;
  nameFa: string;
  brandNameFa: string;
  posterPath: string | null;
  priceToman: number | null;
  compareAtToman: number | null;
  denominationLabel: string;
  regionLabel: string | null;
  deliveryTypeLabel: string;
  stockCount: number;
  inStock: boolean;
  ratingAvg: number;
  ratingCount: number;
};

/** Fetches comparison data for up to 4 product slugs (the compare list lives
 *  in the browser's localStorage; this action resolves it to real data). */
export async function getCompareProductsAction(slugs: string[]): Promise<CompareRow[]> {
  const unique = Array.from(new Set(slugs)).slice(0, 4);
  const rows = await Promise.all(
    unique.map(async (slug) => {
      const p = await getProductBySlug(slug);
      if (!p) return null;
      const variant = p.variants.find((v) => v.isDefault) ?? p.variants[0] ?? null;
      const row: CompareRow = {
        slug: p.slug,
        nameFa: p.nameFa,
        brandNameFa: p.brand.nameFa,
        posterPath: p.gallery[0]?.path ?? null,
        priceToman: variant?.priceToman ?? null,
        compareAtToman: variant?.compareAtToman ?? null,
        denominationLabel: variant?.nameFa ?? '—',
        regionLabel: variant?.regionNameFa ?? null,
        deliveryTypeLabel: deliveryLabel(p.deliveryType),
        stockCount: p.variants.reduce((a, v) => a + v.stockCount, 0),
        inStock: p.variants.some((v) => v.stockCount > 0),
        ratingAvg: p.ratingAvg,
        ratingCount: p.ratingCount,
      };
      return row;
    }),
  );
  return rows.filter((r): r is CompareRow => r !== null);
}
