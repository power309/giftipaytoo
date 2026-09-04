import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCategoryBySlug, listProducts } from '../../_data';
import { parseListingParams, toSearchParamsRecord, type RawSearchParams } from '@/components/storefront/listing-url';
import { Breadcrumbs } from '@/components/storefront/breadcrumbs';
import { FilterSidebar, FilterSheetButton, SortSelect, ActiveFilterChips, ResultCount } from '@/components/storefront/filters';
import { ProductGrid, ProductGridPagination } from '@/components/storefront/product-grid';

export const revalidate = 120;

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<RawSearchParams> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);
  if (!category) return {};
  const title = category.seoTitle || `خرید ${category.nameFa}`;
  const description = category.seoDescription || category.descriptionFa || `خرید ${category.nameFa} با قیمت به تومان و تحویل فوری کد.`;
  return {
    title,
    description,
    alternates: { canonical: `/category/${slug}` },
    openGraph: { title, description, type: 'website' },
  };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;
  const category = await getCategoryBySlug(slug);
  if (!category) notFound();

  const filters = parseListingParams(sp);
  const result = await listProducts({ ...filters, categorySlug: slug });

  const crumbs = [
    ...(category.parent ? [{ label: category.parent.nameFa, href: `/category/${category.parent.slug}` }] : []),
    { label: category.nameFa },
  ];

  return (
    <div className="container-page space-y-5 py-6">
      <Breadcrumbs items={crumbs} />

      <div>
        <h1 className="text-2xl font-extrabold text-fg">{category.nameFa}</h1>
        {category.descriptionFa && <p className="mt-2 max-w-3xl text-sm leading-7 text-fg-muted">{category.descriptionFa}</p>}
      </div>

      {category.children.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {category.children.map((c) => (
            <Link
              key={c.slug}
              href={`/category/${c.slug}`}
              className="rounded-full border border-border-base px-3.5 py-1.5 text-xs font-medium text-fg-muted transition-colors hover:border-primary/40 hover:text-primary"
            >
              {c.nameFa}
            </Link>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-6 lg:flex-row">
        <FilterSidebar facets={result.facets} />

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
            emptyTitle="محصولی در این دسته با فیلترهای انتخابی یافت نشد"
            emptyDescription="یکی از فیلترها را بردارید یا «پاک کردن همه» را بزنید."
          />

          <ProductGridPagination
            page={result.page}
            totalPages={result.totalPages}
            basePath={`/category/${slug}`}
            searchParams={toSearchParamsRecord(sp)}
          />
        </div>
      </div>
    </div>
  );
}
