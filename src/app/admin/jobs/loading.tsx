import { Skeleton, TableSkeleton } from '@/components/ui';

export default function JobsLoading() {
  return (
    <div>
      <Skeleton className="mb-5 h-8 w-32" />
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <div className="rounded-xl border border-border-base bg-surface p-4">
        <TableSkeleton rows={8} cols={5} />
      </div>
    </div>
  );
}
