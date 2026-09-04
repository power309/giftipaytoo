import type { Metadata } from 'next';
import Link from 'next/link';
import { SearchX } from 'lucide-react';
import { db } from '@/server/db';
import { listProducts, visibleProductWhere } from '../_data';
import { parseListingParams, toSearchParamsRecord, type RawSearchParams } from '@/components/storefront/listing-url';
import { FilterSidebar, FilterSheetButton, SortSelect, ActiveFilterChips, ResultCount } from '@/components/storefront/filters';
import { ProductGrid, ProductGridPagination } from '@/components/storefront/product-grid';

export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<RawSearchParams> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const sp = await searchParams;
  const q = Array.isArray(sp.q) ? sp.q[0] : sp.q;
  return {
    title: q ? `نتایج جست‌وجو برای «${q}»` : 'جست‌وجو',
    robots: { index: false, follow: true },
  };
}

async function getPopularSearches(): Promise<string[]> {
  const rows = await db.searchQueryLog.groupBy({
    by: ['normalized'],
    _count: { normalized: true },
    orderBy: { _count: { normalized: 'desc' } },
    take: 8,
  });
  return rows.map((r) => r.normalized).filter(Boolean);
}

async function getSuggestions(): Promise<{ label: string; href: string }[]> {
  const [categories, brands] = await Promise.all([
    db.category.findMany({ where: { parentId: null, isActive: true }, orderBy: { sortOrder: 'asc' }, take: 6, select: { slug: true, nameFa: true } }),
    db.brand.findMany({ where: { isActive: true, isFeatured: true }, orderBy: { sortOrder: 'asc' }, take: 6, select: { slug: true, nameFa: true } }),
  ]);
  return [
    ...categories.map((c) => ({ label: c.nameFa, href: `/category/${c.slug}` })),
    ...brands.map((b) => ({ label: b.nameFa, href: `/brand/${b.slug}` })),
  ];
}

export default async function SearchPage({ searchParams }: Props) {
  const sp = await searchParams;
  const q = (Array.isArray(sp.q) ? sp.q[0] : sp.q)?.trim() ?? '';
  const filters = parseListingParams(sp);

  const [result, totalCatalog] = await Promise.all([
    q ? listProducts({ ...filters, q }) : Promise.resolve(null),
    db.product.count({ where: visibleProductWhere() }),
  ]);

  const showZero = q.length > 0 && result && result.total === 0;
  const [popular, suggestions] = showZero || !q ? await Promise.all([getPopularSearches(), getSuggestions()]) : [[], []];

  return (
    <div className="container-page space-y-5 py-6">
      <h1 className="text-2xl font-extrabold text-fg">
        {q ? (
          <>
            نتایج جست‌وجو برای <span className="text-primary">«{q}»</span>
          </>
        ) : (
          'جست‌وجو در گیفتی‌پی'
        )}
      </h1>

      {!q && (
        <div className="space-y-4">
          <p className="text-sm text-fg-muted tnum">{totalCatalog.toLocaleString('fa-IR')} محصول در فروشگاه — عبارتی برای جست‌وجو وارد کنید.</p>
          <SuggestionBlock title="جست‌وجوهای پرطرفدار" items={popular.map((p) => ({ label: p, href: `/search?q=${encodeURIComponent(p)}` }))} />
          <SuggestionBlock title="دسته‌بندی‌ها و برندهای پیشنهادی" items={suggestions} />
        </div>
      )}

      {q && result && (
        <div className="flex flex-col gap-6 lg:flex-row">
          <FilterSidebar facets={result.facets} />
          <div className="min-w-0 flex-1 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <FilterSheetButton facets={result.facets} resultCount={result.total} />
                <ResultCount total={result.total} />
              </div>
              {result.total > 0 && <SortSelect />}
            </div>

            <ActiveFilterChips facets={result.facets} />

            {result.total === 0 ? (
              <div className="space-y-6">
                <div className="flex flex-col items-center gap-3 py-10 text-center">
                  <span className="grid size-16 place-items-center rounded-2xl bg-surface-muted text-fg-faint">
                    <SearchX className="size-7" aria-hidden />
                  </span>
                  <h2 className="text-base font-semibold text-fg">نتیجه‌ای برای «{q}» یافت نشد</h2>
                  <p className="max-w-sm text-sm text-fg-muted leading-7">
                    املای عبارت را بررسی کنید یا از عبارت‌های کوتاه‌تر و عمومی‌تر استفاده کنید.
                  </p>
                </div>
                <SuggestionBlock title="جست‌وجوهای پرطرفدار" items={popular.map((p) => ({ label: p, href: `/search?q=${encodeURIComponent(p)}` }))} />
                <SuggestionBlock title="شاید این‌ها مدنظرتان باشد" items={suggestions} />
              </div>
            ) : (
              <>
                <ProductGrid products={result.items} />
                <ProductGridPagination page={result.page} totalPages={result.totalPages} basePath="/search" searchParams={toSearchParamsRecord(sp)} />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SuggestionBlock({ title, items }: { title: string; items: { label: string; href: string }[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h2 className="mb-2.5 text-sm font-bold text-fg">{title}</h2>
      <div className="flex flex-wrap gap-2">
        {items.map((it) => (
          <Link
            key={it.href}
            href={it.href}
            className="rounded-full border border-border-base px-3.5 py-1.5 text-xs font-medium text-fg-muted transition-colors hover:border-primary/40 hover:text-primary"
          >
            {it.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
