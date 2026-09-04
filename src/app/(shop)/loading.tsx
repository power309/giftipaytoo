import { Skeleton } from '@/components/ui';

/** Generic fallback while a shop route's own loading.tsx (if any) hasn't kicked in yet. */
export default function ShopLoading() {
  return (
    <div className="container-page py-8 space-y-4" aria-hidden>
      <Skeleton className="h-8 w-48" />
      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-3">
          <Skeleton className="h-28 w-full rounded-2xl" />
          <Skeleton className="h-28 w-full rounded-2xl" />
          <Skeleton className="h-28 w-full rounded-2xl" />
        </div>
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    </div>
  );
}
