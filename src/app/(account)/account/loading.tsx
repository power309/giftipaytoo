import { Skeleton } from '@/components/ui';

/**
 * Shown by Next.js while a nested `/account/*` route's server payload is
 * streaming in (initial load and client-side navigation alike). Generic on
 * purpose — every account list page shares this same card/rows shape.
 */
export default function AccountLoading() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="در حال بارگذاری">
      <div className="flex items-center justify-between">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-9 w-28 rounded-xl" />
      </div>
      <div className="card space-y-3 p-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="size-11 shrink-0 rounded-xl" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
