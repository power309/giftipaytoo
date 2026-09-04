import { Skeleton } from '@/components/ui';

export default function BannersLoading() {
  return (
    <div>
      <Skeleton className="mb-5 h-8 w-32" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-56 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
