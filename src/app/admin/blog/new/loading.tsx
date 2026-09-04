import { Skeleton } from '@/components/ui';

export default function NewPageLoading() {
  return (
    <div>
      <Skeleton className="mb-5 h-8 w-32" />
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-96 rounded-xl lg:col-span-2" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    </div>
  );
}
