'use client';

import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { SlidersHorizontal, X, ChevronDown } from 'lucide-react';
import { Button, Checkbox, Badge } from '@/components/ui';
import { formatTomanDigits } from '@/lib/money';
import { toPersianDigits, parsePersianNumber } from '@/lib/persian';
import { cn } from '@/lib/utils';
import { deliveryLabel, SORT_LABELS, type ProductListFacets, type SortKey } from '@/app/(storefront)/_data';
import {
  buildQuery,
  parseListingParams,
  withoutListValue,
  withParam,
  type RawSearchParams,
} from './listing-url';

function useListingNav() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const raw = React.useMemo<RawSearchParams>(() => {
    const o: RawSearchParams = {};
    searchParams.forEach((v, k) => {
      o[k] = v;
    });
    return o;
  }, [searchParams]);

  const push = React.useCallback(
    (next: RawSearchParams) => {
      const asRecord: Record<string, string | undefined> = {};
      for (const [k, v] of Object.entries(next)) asRecord[k] = Array.isArray(v) ? v[0] : v;
      router.push(`${pathname}${buildQuery(asRecord)}`, { scroll: false });
    },
    [router, pathname],
  );

  return { raw, push, filters: parseListingParams(raw) };
}

// ── Sort ──────────────────────────────────────────────────────────────────

const SORT_ORDER: SortKey[] = ['newest', 'popular', 'best-selling', 'price-asc', 'price-desc', 'discount', 'rating'];

export function SortSelect() {
  const { raw, push, filters } = useListingNav();
  const active = filters.sort ?? 'newest';
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex h-10 items-center gap-2 rounded-xl border border-border-base bg-surface px-3.5 text-sm text-fg transition-colors hover:border-primary/40"
      >
        مرتب‌سازی: <span className="font-semibold">{SORT_LABELS[active]}</span>
        <ChevronDown className={cn('size-4 text-fg-faint transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      {open && (
        <ul
          role="listbox"
          className="absolute end-0 top-[calc(100%+0.4rem)] z-30 w-52 overflow-hidden rounded-xl border border-border-base bg-surface p-1 shadow-[var(--shadow-lift)] gp-fade-up"
        >
          {SORT_ORDER.map((key) => (
            <li key={key}>
              <button
                type="button"
                role="option"
                aria-selected={active === key}
                onClick={() => {
                  setOpen(false);
                  push(withParam(raw, 'sort', key === 'newest' ? undefined : key));
                }}
                className={cn(
                  'block w-full rounded-lg px-3 py-2 text-start text-sm transition-colors',
                  active === key ? 'bg-primary-soft text-primary font-medium' : 'text-fg hover:bg-surface-muted',
                )}
              >
                {SORT_LABELS[key]}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Active filter chips ──────────────────────────────────────────────────

export function ActiveFilterChips({ facets }: { facets: ProductListFacets }) {
  const { raw, push, filters } = useListingNav();

  const chips: { key: string; label: string; onRemove: () => void }[] = [];

  const labelOf = (opts: { value: string; label: string }[], value: string) =>
    opts.find((o) => o.value === value)?.label ?? value;

  for (const v of filters.platformSlugs ?? [])
    chips.push({ key: `platform-${v}`, label: labelOf(facets.platforms, v), onRemove: () => push(withoutListValue(raw, 'platform', v)) });
  for (const v of filters.regionCodes ?? [])
    chips.push({ key: `region-${v}`, label: labelOf(facets.regions, v), onRemove: () => push(withoutListValue(raw, 'region', v)) });
  for (const v of filters.currencyCodes ?? [])
    chips.push({ key: `currency-${v}`, label: v, onRemove: () => push(withoutListValue(raw, 'currency', v)) });
  for (const v of filters.deliveryTypes ?? [])
    chips.push({ key: `delivery-${v}`, label: deliveryLabel(v), onRemove: () => push(withoutListValue(raw, 'delivery', v)) });
  for (const v of filters.tags ?? [])
    chips.push({ key: `tag-${v}`, label: labelOf(facets.tags, v), onRemove: () => push(withoutListValue(raw, 'tag', v)) });
  if (filters.priceMin != null || filters.priceMax != null) {
    const lbl = `قیمت: ${filters.priceMin != null ? formatTomanDigits(filters.priceMin) : '۰'} تا ${filters.priceMax != null ? formatTomanDigits(filters.priceMax) : '∞'} تومان`;
    chips.push({
      key: 'price',
      label: lbl,
      onRemove: () => push(withParam(withParam(raw, 'priceMin', undefined), 'priceMax', undefined)),
    });
  }
  if (filters.inStockOnly) chips.push({ key: 'stock', label: 'فقط موجود', onRemove: () => push(withParam(raw, 'stock', undefined)) });
  if (filters.discountOnly) chips.push({ key: 'discount', label: 'فقط تخفیف‌دار', onRemove: () => push(withParam(raw, 'discount', undefined)) });

  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map((c) => (
        <button
          key={c.key}
          type="button"
          onClick={c.onRemove}
          className="flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary-soft px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary hover:text-primary-contrast"
        >
          {c.label}
          <X className="size-3.5" aria-hidden />
        </button>
      ))}
      <button
        type="button"
        onClick={() => push({})}
        className="text-xs font-medium text-fg-muted underline underline-offset-4 hover:text-danger"
      >
        پاک کردن همه
      </button>
    </div>
  );
}

// ── Filter body (shared by sidebar + sheet) ─────────────────────────────

function FilterBody({ facets, showCategory }: { facets: ProductListFacets; showCategory?: boolean }) {
  const { raw, push, filters } = useListingNav();
  const [priceMin, setPriceMin] = React.useState(filters.priceMin != null ? String(filters.priceMin) : '');
  const [priceMax, setPriceMax] = React.useState(filters.priceMax != null ? String(filters.priceMax) : '');

  React.useEffect(() => {
    setPriceMin(filters.priceMin != null ? String(filters.priceMin) : '');
    setPriceMax(filters.priceMax != null ? String(filters.priceMax) : '');
  }, [filters.priceMin, filters.priceMax]);

  const toggleList = (key: string, value: string, current: string[] | undefined) => {
    const set = new Set(current ?? []);
    if (set.has(value)) set.delete(value);
    else set.add(value);
    push(withParam(raw, key, set.size ? Array.from(set).join(',') : undefined));
  };

  const applyPrice = () => {
    const min = priceMin.trim() ? parsePersianNumber(priceMin) : null;
    const max = priceMax.trim() ? parsePersianNumber(priceMax) : null;
    let next = withParam(raw, 'priceMin', min != null && min > 0 ? String(min) : undefined);
    next = withParam(next, 'priceMax', max != null && max > 0 ? String(max) : undefined);
    push(next);
  };

  return (
    <div className="space-y-6">
      {facets.brands.length > 0 && !showCategory && (
        <FilterGroup title="برند">
          {facets.brands.slice(0, 12).map((b) => (
            <Checkbox
              key={b.value}
              label={
                <span className="flex w-full items-center justify-between gap-2">
                  {b.label} <span className="text-fg-faint tnum">({toPersianDigits(b.count)})</span>
                </span>
              }
              checked={filters.brandSlug === b.value}
              onChange={() => push(withParam(raw, 'brand', filters.brandSlug === b.value ? undefined : b.value))}
            />
          ))}
        </FilterGroup>
      )}

      {facets.platforms.length > 0 && (
        <FilterGroup title="پلتفرم">
          {facets.platforms.map((p) => (
            <Checkbox
              key={p.value}
              label={
                <span className="flex w-full items-center justify-between gap-2">
                  {p.label} <span className="text-fg-faint tnum">({toPersianDigits(p.count)})</span>
                </span>
              }
              checked={(filters.platformSlugs ?? []).includes(p.value)}
              onChange={() => toggleList('platform', p.value, filters.platformSlugs)}
            />
          ))}
        </FilterGroup>
      )}

      {facets.regions.length > 0 && (
        <FilterGroup title="ریجن">
          {facets.regions.map((r) => (
            <Checkbox
              key={r.value}
              label={
                <span className="flex w-full items-center justify-between gap-2">
                  {r.label} <span className="text-fg-faint tnum">({toPersianDigits(r.count)})</span>
                </span>
              }
              checked={(filters.regionCodes ?? []).includes(r.value)}
              onChange={() => toggleList('region', r.value, filters.regionCodes)}
            />
          ))}
        </FilterGroup>
      )}

      {facets.currencies.length > 0 && (
        <FilterGroup title="واحد پول">
          {facets.currencies.map((c) => (
            <Checkbox
              key={c.value}
              label={
                <span className="flex w-full items-center justify-between gap-2" dir="ltr">
                  {c.label} <span className="text-fg-faint tnum">({toPersianDigits(c.count)})</span>
                </span>
              }
              checked={(filters.currencyCodes ?? []).includes(c.value)}
              onChange={() => toggleList('currency', c.value, filters.currencyCodes)}
            />
          ))}
        </FilterGroup>
      )}

      <FilterGroup title="بازه قیمت (تومان)">
        <div className="flex items-center gap-2">
          <input
            type="text"
            inputMode="numeric"
            value={priceMin}
            onChange={(e) => setPriceMin(e.target.value)}
            onBlur={applyPrice}
            placeholder="از"
            className="h-10 w-full rounded-lg border border-border-base bg-surface px-2.5 text-sm tnum text-fg placeholder:text-fg-faint focus:border-primary focus:outline-2 focus:outline-primary/25"
          />
          <span className="text-fg-faint">—</span>
          <input
            type="text"
            inputMode="numeric"
            value={priceMax}
            onChange={(e) => setPriceMax(e.target.value)}
            onBlur={applyPrice}
            placeholder="تا"
            className="h-10 w-full rounded-lg border border-border-base bg-surface px-2.5 text-sm tnum text-fg placeholder:text-fg-faint focus:border-primary focus:outline-2 focus:outline-primary/25"
          />
        </div>
        {facets.priceMax > 0 && (
          <p className="mt-1.5 text-[11px] text-fg-faint tnum">
            بین {formatTomanDigits(facets.priceMin)} تا {formatTomanDigits(facets.priceMax)} تومان
          </p>
        )}
      </FilterGroup>

      {facets.deliveryTypes.length > 1 && (
        <FilterGroup title="نوع تحویل">
          {facets.deliveryTypes.map((d) => (
            <Checkbox
              key={d.value}
              label={d.label}
              checked={(filters.deliveryTypes ?? []).includes(d.value)}
              onChange={() => toggleList('delivery', d.value, filters.deliveryTypes)}
            />
          ))}
        </FilterGroup>
      )}

      {facets.tags.length > 0 && (
        <FilterGroup title="برچسب‌ها">
          <div className="flex flex-wrap gap-1.5">
            {facets.tags.slice(0, 16).map((t) => {
              const active = (filters.tags ?? []).includes(t.value);
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => toggleList('tag', t.value, filters.tags)}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs transition-colors',
                    active
                      ? 'border-primary bg-primary text-primary-contrast'
                      : 'border-border-base text-fg-muted hover:border-primary/40',
                  )}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </FilterGroup>
      )}

      <FilterGroup title="در دسترس بودن">
        <Checkbox label="فقط کالاهای موجود" checked={!!filters.inStockOnly} onChange={() => push(withParam(raw, 'stock', filters.inStockOnly ? undefined : '1'))} />
        <Checkbox label="فقط تخفیف‌دارها" checked={!!filters.discountOnly} onChange={() => push(withParam(raw, 'discount', filters.discountOnly ? undefined : '1'))} />
      </FilterGroup>
    </div>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset>
      <legend className="mb-2.5 text-sm font-bold text-fg">{title}</legend>
      <div className="space-y-2">{children}</div>
    </fieldset>
  );
}

// ── Desktop sidebar ──────────────────────────────────────────────────────

export function FilterSidebar({ facets, showCategory }: { facets: ProductListFacets; showCategory?: boolean }) {
  return (
    <aside aria-label="فیلترها" className="hidden w-64 shrink-0 lg:block">
      <div className="sticky top-24 max-h-[calc(100dvh-7rem)] overflow-y-auto rounded-2xl border border-border-base bg-surface p-4">
        <FilterBody facets={facets} showCategory={showCategory} />
      </div>
    </aside>
  );
}

// ── Mobile bottom sheet ──────────────────────────────────────────────────

export function FilterSheetButton({ facets, resultCount, showCategory }: { facets: ProductListFacets; resultCount: number; showCategory?: boolean }) {
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open]);

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="lg:hidden">
        <SlidersHorizontal className="size-4" aria-hidden />
        فیلترها
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-ink-950/55 backdrop-blur-sm" onClick={() => setOpen(false)} aria-hidden />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="فیلترها"
            className="absolute inset-x-0 bottom-0 flex max-h-[88dvh] flex-col rounded-t-2xl bg-surface shadow-xl gp-fade-up"
          >
            <div className="flex items-center justify-between border-b border-border-base p-4">
              <span className="text-base font-bold text-fg">فیلترها</span>
              <button type="button" onClick={() => setOpen(false)} aria-label="بستن" className="rounded-lg p-1.5 text-fg-muted hover:bg-surface-muted">
                <X className="size-5" aria-hidden />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <FilterBody facets={facets} showCategory={showCategory} />
            </div>
            <div className="border-t border-border-base p-4">
              <Button fullWidth onClick={() => setOpen(false)}>
                نمایش {toPersianDigits(resultCount)} نتیجه
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function ResultCount({ total }: { total: number }) {
  return (
    <p className="text-sm text-fg-muted tnum">
      <Badge tone="neutral" size="sm">{toPersianDigits(total)}</Badge> محصول یافت شد
    </p>
  );
}
