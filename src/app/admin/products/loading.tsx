import { Skeleton, TableSkeleton } from '@/components/ui';

export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-9 w-32" />
      </div>
      <div className="rounded-xl border border-border-base bg-surface p-4">
        <TableSkeleton rows={10} cols={7} />
      </div>
    </div>
  );
}
