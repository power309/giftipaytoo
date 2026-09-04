import { Skeleton, TableSkeleton } from '@/components/ui';

export default function TicketsLoading() {
  return (
    <div>
      <Skeleton className="mb-5 h-8 w-40" />
      <div className="rounded-xl border border-border-base bg-surface p-4">
        <TableSkeleton rows={10} cols={7} />
      </div>
    </div>
  );
}
