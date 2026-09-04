import { Skeleton } from '@/components/ui';

export default function InvoiceLoading() {
  return (
    <div className="mx-auto max-w-2xl">
      <Skeleton className="h-96 rounded-xl" />
    </div>
  );
}
