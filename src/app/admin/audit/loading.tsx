import { Skeleton, TableSkeleton } from '@/components/ui';

export default function AuditLoading() {
  return (
    <div>
      <Skeleton className="mb-5 h-8 w-32" />
      <div className="rounded-xl border border-border-base bg-surface p-4">
        <TableSkeleton rows={12} cols={6} />
      </div>
    </div>
  );
}
