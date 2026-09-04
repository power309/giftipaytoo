import { Skeleton } from '@/components/ui';

export default function JobDetailLoading() {
  return (
    <div>
      <Skeleton className="mb-5 h-8 w-48" />
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-64 rounded-xl lg:col-span-2" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    </div>
  );
}
