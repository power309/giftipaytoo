import { Skeleton } from '@/components/ui';

export default function OrderDetailLoading() {
  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-6 w-40" />
      </div>
      <div className="mb-5 flex gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-28 rounded-lg" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
        </div>
      </div>
    </div>
  );
}
