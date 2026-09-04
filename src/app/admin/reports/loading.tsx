import { Skeleton } from '@/components/ui';

export default function ReportsLoading() {
  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-9 w-72 rounded-xl" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="mt-4 h-64 rounded-xl" />
    </div>
  );
}
