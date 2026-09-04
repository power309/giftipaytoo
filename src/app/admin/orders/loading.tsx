import { Skeleton, TableSkeleton } from '@/components/ui';

export default function OrdersLoading() {
  return (
    <div>
      <Skeleton className="mb-5 h-8 w-40" />
      <div className="mb-3 flex gap-2">
        <Skeleton className="h-10 w-64 rounded-xl" />
        <Skeleton className="h-10 w-24 rounded-xl" />
      </div>
      <div className="rounded-xl border border-border-base bg-surface p-4">
        <TableSkeleton rows={10} cols={7} />
      </div>
    </div>
  );
}
