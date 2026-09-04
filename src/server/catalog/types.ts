/**
 * Shared types for the catalog read layer (queries, search, facets).
 * Framework-free except for Prisma's generated enum types.
 */
import type { DeliveryType } from '@prisma/client';

export type ProductSort =
  | 'newest'
  | 'popular'
  | 'best-selling'
  | 'price-asc'
  | 'price-desc'
  | 'discount'
  | 'rating';

export const PRODUCT_SORTS: ProductSort[] = [
  'newest',
  'popular',
  'best-selling',
  'price-asc',
  'price-desc',
  'discount',
  'rating',
];

/** Fixed Toman price buckets used for facet counts and the price-bucket filter. */
export const PRICE_BUCKETS: { key: string; minToman: number | null; maxToman: number | null; labelFa: string }[] = [
  { key: 'b0', minToman: 0, maxToman: 100_000, labelFa: 'تا ۱۰۰ هزار تومان' },
  { key: 'b1', minToman: 100_000, maxToman: 300_000, labelFa: '۱۰۰ تا ۳۰۰ هزار تومان' },
  { key: 'b2', minToman: 300_000, maxToman: 1_000_000, labelFa: '۳۰۰ هزار تا ۱ میلیون تومان' },
  { key: 'b3', minToman: 1_000_000, maxToman: 3_000_000, labelFa: '۱ تا ۳ میلیون تومان' },
  { key: 'b4', minToman: 3_000_000, maxToman: null, labelFa: 'بیش از ۳ میلیون تومان' },
];

export type ProductFilters = {
  categorySlug?: string;
  brandSlugs?: string[];
  platformSlugs?: string[];
  regionCodes?: string[];
  currencyCodes?: string[];
  priceMinToman?: number;
  priceMaxToman?: number;
  denominationMin?: number;
  denominationMax?: number;
  inStockOnly?: boolean;
  deliveryTypes?: DeliveryType[];
  hasDiscount?: boolean;
  tagSlugs?: string[];
  /** Free-text search query — matched via search.ts, then intersected with the other filters. */
  q?: string;
};

export type ListProductsOptions = {
  page?: number;
  perPage?: number;
  sort?: ProductSort;
};

export type FacetCount = { value: string; label: string; count: number };

export type ProductFacets = {
  categories: FacetCount[];
  brands: FacetCount[];
  platforms: FacetCount[];
  regions: FacetCount[];
  priceBuckets: (FacetCount & { minToman: number | null; maxToman: number | null })[];
  availability: { inStock: number; outOfStock: number };
};

export type ListProductsResult<T> = {
  items: T[];
  total: number;
  page: number;
  perPage: number;
  pageCount: number;
  facets: ProductFacets;
};
