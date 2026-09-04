import { Skeleton, TableSkeleton } from '@/components/ui';

export default function CustomersLoading() {
  return (
    <div>
      <Skeleton className="mb-5 h-8 w-32" />
      <div className="rounded-xl border border-border-base bg-surface p-4">
        <TableSkeleton rows={10} cols={7} />
      </div>
    </div>
  );
}
