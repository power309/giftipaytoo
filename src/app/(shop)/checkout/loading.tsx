import { Skeleton } from '@/components/ui';

export default function CheckoutLoading() {
  return (
    <div className="container-page py-6 sm:py-8" aria-busy="true">
      <Skeleton className="mb-6 h-10 w-full max-w-sm mx-auto rounded-full" />
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <Skeleton className="h-96 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    </div>
  );
}
