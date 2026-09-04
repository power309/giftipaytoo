import { Skeleton } from '@/components/ui';

export default function AuditDetailLoading() {
  return (
    <div>
      <Skeleton className="mb-5 h-8 w-56" />
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-72 rounded-xl lg:col-span-2" />
        <Skeleton className="h-56 rounded-xl" />
      </div>
    </div>
  );
}
