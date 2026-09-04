import type { Metadata } from 'next';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { getBrandBySlug, listProducts } from '../../_data';
import { parseListingParams, toSearchParamsRecord, type RawSearchParams } from '@/components/storefront/listing-url';
import { Breadcrumbs } from '@/components/storefront/breadcrumbs';
import { FilterSidebar, FilterSheetButton, SortSelect, ActiveFilterChips, ResultCount } from '@/components/storefront/filters';
import { ProductGrid, ProductGridPagination } from '@/components/storefront/product-grid';

export const revalidate = 120;

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<RawSearchParams> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const brand = await getBrandBySlug(slug);
  if (!brand) return {};
  const title = brand.seoTitle || `خرید محصولات ${brand.nameFa}`;
  const description = brand.seoDescription || brand.descriptionFa || `خرید گیفت کارت و محصولات ${brand.nameFa} با قیمت به تومان.`;
  return {
    title,
    description,
    alternates: { canonical: `/brand/${slug}` },
    openGraph: { title, description, type: 'website' },
  };
}

export default async function BrandPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;
  const brand = await getBrandBySlug(slug);
  if (!brand) notFound();

  const filters = parseListingParams(sp);
  const result = await listProducts({ ...filters, brandSlug: slug });

  return (
    <div className="container-page space-y-5 py-6">
      <Breadcrumbs items={[{ label: 'برندها', href: '/brands' }, { label: brand.nameFa }]} />

      <div className="flex items-center gap-4">
        {brand.logoPath ? (
          <Image src={brand.logoPath} alt="" width={64} height={64} className="size-16 rounded-2xl border border-border-base object-contain p-2" />
        ) : (
          <span className="grid size-16 place-items-center rounded-2xl bg-surface-muted text-lg text-fg-faint">{brand.nameFa.slice(0, 2)}</span>
        )}
        <div>
          <h1 className="text-2xl font-extrabold text-fg">{brand.nameFa}</h1>
          {brand.descriptionFa && <p className="mt-1 max-w-2xl text-sm leading-7 text-fg-muted">{brand.descriptionFa}</p>}
        </div>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        <FilterSidebar facets={result.facets} showCategory={false} />

        <div className="min-w-0 flex-1 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <FilterSheetButton facets={result.facets} resultCount={result.total} />
              <ResultCount total={result.total} />
            </div>
            <SortSelect />
          </div>

          <ActiveFilterChips facets={result.facets} />

          <ProductGrid
            products={result.items}
            emptyTitle={`محصولی از ${brand.nameFa} با این فیلترها یافت نشد`}
            emptyDescription="یکی از فیلترها را بردارید یا «پاک کردن همه» را بزنید."
          />

          <ProductGridPagination
            page={result.page}
            totalPages={result.totalPages}
            basePath={`/brand/${slug}`}
            searchParams={toSearchParamsRecord(sp)}
          />
        </div>
      </div>
    </div>
  );
}
