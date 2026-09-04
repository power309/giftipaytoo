import { Skeleton } from '@/components/ui';

export default function ProductLoading() {
  return (
    <div className="container-page space-y-8 py-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">در حال بارگذاری…</span>
      <Skeleton className="h-4 w-56" />
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-10">
        <Skeleton className="aspect-square w-full rounded-2xl" />
        <div className="space-y-4">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-32 w-full rounded-2xl" />
          <Skeleton className="h-11 w-full rounded-xl" />
          <div className="flex gap-2.5">
            <Skeleton className="h-13 flex-1 rounded-xl" />
            <Skeleton className="h-13 flex-1 rounded-xl" />
          </div>
        </div>
      </div>
      <Skeleton className="h-10 w-full rounded-xl" />
      <Skeleton className="h-40 w-full rounded-2xl" />
    </div>
  );
}
