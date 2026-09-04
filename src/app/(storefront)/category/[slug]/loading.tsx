import { Skeleton } from '@/components/ui';
import { ProductGridSkeleton } from '@/components/storefront/product-grid';

export default function CategoryLoading() {
  return (
    <div className="container-page space-y-5 py-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">در حال بارگذاری…</span>
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-8 w-64" />
      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="hidden w-64 shrink-0 space-y-4 lg:block">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-2xl" />
          ))}
        </div>
        <div className="min-w-0 flex-1 space-y-4">
          <Skeleton className="h-10 w-full rounded-xl" />
          <ProductGridSkeleton />
        </div>
      </div>
    </div>
  );
}
