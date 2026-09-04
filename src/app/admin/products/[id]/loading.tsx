import { Skeleton } from '@/components/ui';

export default function Loading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-56" />
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="card space-y-4 p-6">
          <Skeleton className="h-9 w-full" />
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-11 w-full" />
          ))}
        </div>
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}
