import { Skeleton } from '@/components/ui';

export default function ReviewsQueueLoading() {
  return (
    <div>
      <Skeleton className="mb-5 h-8 w-48" />
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
