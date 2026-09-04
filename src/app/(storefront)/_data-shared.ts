/**
 * Types and pure helpers shared between the server data layer (`_data.ts`,
 * which is `server-only`) and client components (filters, sort, etc.).
 * Nothing here touches Prisma or the database, so it is safe to import from
 * either side without pulling server-only code into the client bundle.
 */

export type SortKey =
  | 'newest'
  | 'popular'
  | 'best-selling'
  | 'price-asc'
  | 'price-desc'
  | 'discount'
  | 'rating';

export const SORT_LABELS: Record<SortKey, string> = {
  newest: 'جدیدترین',
  popular: 'محبوب‌ترین',
  'best-selling': 'پرفروش‌ترین',
  'price-asc': 'ارزان‌ترین',
  'price-desc': 'گران‌ترین',
  discount: 'بیشترین تخفیف',
  rating: 'بالاترین امتیاز',
};

export type ProductFilters = {
  categorySlug?: string;
  brandSlug?: string;
  platformSlugs?: string[];
  regionCodes?: string[];
  currencyCodes?: string[];
  priceMin?: number;
  priceMax?: number;
  denominations?: number[]; // matched against variant.denominationMinor
  inStockOnly?: boolean;
  deliveryTypes?: string[];
  discountOnly?: boolean;
  tags?: string[];
  q?: string;
  sort?: SortKey;
  page?: number;
  perPage?: number;
};

export type FacetOption = { value: string; label: string; count: number };

export type ProductListFacets = {
  categories: FacetOption[];
  brands: FacetOption[];
  platforms: FacetOption[];
  regions: FacetOption[];
  currencies: FacetOption[];
  deliveryTypes: FacetOption[];
  tags: FacetOption[];
  priceMin: number;
  priceMax: number;
};

export function deliveryLabel(type: string): string {
  switch (type) {
    case 'INSTANT_CODE':
      return 'تحویل آنی کد';
    case 'MANUAL_CODE':
      return 'تحویل دستی کد';
    case 'ACCOUNT_TOPUP':
      return 'شارژ مستقیم حساب';
    case 'SUPPLIER_API':
      return 'تحویل خودکار از تأمین‌کننده';
    default:
      return type;
  }
}
