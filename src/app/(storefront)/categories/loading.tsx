import { Skeleton } from '@/components/ui';

export default function CategoriesLoading() {
  return (
    <div className="container-page space-y-6 py-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">در حال بارگذاری…</span>
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-10 w-full rounded-xl" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 12 }).map((_, i) => (
          <Skeleton key={i} className="h-14 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
