import { Skeleton } from '@/components/ui';

export default function FaqsLoading() {
  return (
    <div>
      <Skeleton className="mb-5 h-8 w-40" />
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
