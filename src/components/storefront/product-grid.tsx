import { PackageSearch } from 'lucide-react';
import { EmptyState, Pagination, ProductCardSkeleton } from '@/components/ui';
import { ProductCard, type ProductCardData } from './product-card';

export function ProductGrid({
  products,
  emptyTitle = 'محصولی یافت نشد',
  emptyDescription = 'فیلترها را تغییر دهید یا جست‌وجوی دیگری را امتحان کنید.',
}: {
  products: ProductCardData[];
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  if (products.length === 0) {
    return (
      <EmptyState
        icon={<PackageSearch className="size-7" aria-hidden />}
        title={emptyTitle}
        description={emptyDescription}
      />
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 sm:gap-4 xl:grid-cols-4">
      {products.map((p) => (
        <ProductCard key={p.slug} product={p} />
      ))}
    </div>
  );
}

export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 sm:gap-4 xl:grid-cols-4" aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <ProductCardSkeleton key={i} />
      ))}
    </div>
  );
}

export function ProductGridPagination({
  page,
  totalPages,
  basePath,
  searchParams,
}: {
  page: number;
  totalPages: number;
  basePath: string;
  searchParams: Record<string, string | undefined>;
}) {
  const buildHref = (p: number) => {
    const usp = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) {
      if (v && k !== 'page') usp.set(k, v);
    }
    if (p > 1) usp.set('page', String(p));
    const qs = usp.toString();
    return `${basePath}${qs ? `?${qs}` : ''}`;
  };
  return <Pagination page={page} totalPages={totalPages} buildHref={buildHref} />;
}

export function RailSkeleton() {
  return (
    <div className="no-scrollbar -mx-4 flex gap-3.5 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0" aria-hidden>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="w-[calc(50%-0.5rem)] shrink-0 sm:w-56 lg:w-60">
          <ProductCardSkeleton />
        </div>
      ))}
    </div>
  );
}
