import type { ProductFilters, SortKey } from '@/app/(storefront)/_data';

/**
 * Shared URL <-> filter-state mapping for category/brand/search listings.
 * Every filter lives in the query string so results are shareable and can
 * be server-rendered directly from `searchParams`.
 */

export type RawSearchParams = Record<string, string | string[] | undefined>;

function one(sp: RawSearchParams, key: string): string | undefined {
  const v = sp[key];
  return Array.isArray(v) ? v[0] : v;
}

function list(sp: RawSearchParams, key: string): string[] | undefined {
  const v = one(sp, key);
  if (!v) return undefined;
  const items = v.split(',').map((s) => s.trim()).filter(Boolean);
  return items.length ? items : undefined;
}

function num(sp: RawSearchParams, key: string): number | undefined {
  const v = one(sp, key);
  if (!v) return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : undefined;
}

const SORT_KEYS: SortKey[] = ['newest', 'popular', 'best-selling', 'price-asc', 'price-desc', 'discount', 'rating'];

export function parseListingParams(sp: RawSearchParams): ProductFilters {
  const sortRaw = one(sp, 'sort');
  const sort = SORT_KEYS.includes(sortRaw as SortKey) ? (sortRaw as SortKey) : undefined;
  return {
    brandSlug: one(sp, 'brand'),
    platformSlugs: list(sp, 'platform'),
    regionCodes: list(sp, 'region'),
    currencyCodes: list(sp, 'currency'),
    priceMin: num(sp, 'priceMin'),
    priceMax: num(sp, 'priceMax'),
    denominations: list(sp, 'denom')?.map(Number).filter((n) => Number.isFinite(n)),
    inStockOnly: one(sp, 'stock') === '1',
    deliveryTypes: list(sp, 'delivery'),
    discountOnly: one(sp, 'discount') === '1',
    tags: list(sp, 'tag'),
    q: one(sp, 'q'),
    sort,
    page: num(sp, 'page') || 1,
  };
}

export const FILTER_KEYS = [
  'brand',
  'platform',
  'region',
  'currency',
  'priceMin',
  'priceMax',
  'denom',
  'stock',
  'delivery',
  'discount',
  'tag',
] as const;

export type FilterChip = { key: string; label: string; href: string };

/** Build a query string from a plain params record, dropping empties. */
export function buildQuery(params: Record<string, string | undefined>): string {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') usp.set(k, v);
  }
  const s = usp.toString();
  return s ? `?${s}` : '';
}

export function withParam(sp: RawSearchParams, key: string, value: string | undefined): RawSearchParams {
  const next: RawSearchParams = { ...sp };
  if (value === undefined) delete next[key];
  else next[key] = value;
  if (key !== 'page') delete next.page;
  return next;
}

export function toSearchParamsRecord(sp: RawSearchParams): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(sp)) {
    const val = Array.isArray(v) ? v[0] : v;
    if (val) out[k] = val;
  }
  return out;
}

/** Remove one value from a comma-list param, or drop the key entirely. */
export function withoutListValue(sp: RawSearchParams, key: string, value: string): RawSearchParams {
  const current = list(sp, key) ?? [];
  const next = current.filter((v) => v !== value);
  return withParam(sp, key, next.length ? next.join(',') : undefined);
}
