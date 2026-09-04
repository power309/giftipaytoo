import { Skeleton } from '@/components/ui';
import { ProductGridSkeleton } from '@/components/storefront/product-grid';

export default function StorefrontLoading() {
  return (
    <div className="container-page space-y-8 py-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">در حال بارگذاری…</span>
      <Skeleton className="aspect-[16/9] w-full rounded-2xl sm:aspect-[21/9]" />
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-2xl" />
        ))}
      </div>
      <ProductGridSkeleton />
    </div>
  );
}
