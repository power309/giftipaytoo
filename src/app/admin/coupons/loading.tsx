import { Skeleton } from '@/components/ui';

export default function CouponsLoading() {
  return (
    <div>
      <Skeleton className="mb-5 h-8 w-48" />
      <Skeleton className="mb-4 h-10 w-64 rounded-xl" />
      <Skeleton className="h-72 rounded-xl" />
    </div>
  );
}
