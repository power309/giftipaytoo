import { Skeleton } from '@/components/ui';

export default function MenusLoading() {
  return (
    <div>
      <Skeleton className="mb-5 h-8 w-32" />
      <Skeleton className="mb-4 h-10 w-64 rounded-xl" />
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-14 rounded-lg" />
        ))}
      </div>
    </div>
  );
}
