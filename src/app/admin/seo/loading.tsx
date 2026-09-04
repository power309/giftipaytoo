import { Skeleton } from '@/components/ui';

export default function SeoLoading() {
  return (
    <div>
      <Skeleton className="mb-5 h-8 w-40" />
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-56 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
