import { Skeleton } from '@/components/ui';

export default function BlogPostLoading() {
  return (
    <div className="container-page max-w-3xl space-y-5 py-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">در حال بارگذاری…</span>
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-8 w-full" />
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="aspect-[16/9] w-full rounded-2xl" />
      <div className="space-y-2.5">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-4 w-full" />
        ))}
      </div>
    </div>
  );
}
