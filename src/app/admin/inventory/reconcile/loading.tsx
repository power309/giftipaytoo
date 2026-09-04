import { Skeleton } from '@/components/ui';

export default function Loading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-40 w-full rounded-xl" />
    </div>
  );
}
