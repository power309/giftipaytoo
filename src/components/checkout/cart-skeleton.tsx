import { Skeleton } from '@/components/ui';

export function CartSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]" aria-hidden>
      <ul className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <li key={i} className="card flex gap-4 p-4">
            <Skeleton className="size-24 shrink-0 rounded-xl" />
            <div className="flex-1 space-y-2.5 py-1">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
              <Skeleton className="h-9 w-32 rounded-xl" />
            </div>
          </li>
        ))}
      </ul>
      <Skeleton className="h-80 w-full rounded-2xl" />
    </div>
  );
}
