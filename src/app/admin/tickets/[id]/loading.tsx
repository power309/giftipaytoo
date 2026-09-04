import { Skeleton } from '@/components/ui';

export default function TicketDetailLoading() {
  return (
    <div>
      <Skeleton className="mb-5 h-8 w-56" />
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-96 rounded-xl lg:col-span-2" />
        <div className="space-y-4">
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
        </div>
      </div>
    </div>
  );
}
